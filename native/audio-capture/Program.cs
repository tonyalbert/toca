// toca-audio-capture: captura o áudio do sistema EXCETO o de um processo (e
// dos processos filhos dele), usando a API de process loopback do Windows.
//
// O Toca usa isso no compartilhamento de tela com áudio: o loopback comum do
// Chromium pega tudo o que toca no PC, inclusive as vozes da chamada, e quem
// está na sala ouviria o próprio eco. Excluindo a árvore de processos do Toca,
// vão só o jogo, o vídeo, a música etc.
//
// Uso:  toca-audio-capture.exe <pid-a-excluir>
// Saída (stdout): PCM 16 bits, 48000 Hz, estéreo, intercalado, little-endian.
// Mensagens e erros vão para stderr. Encerra quando o stdout é fechado.
//
// Requer Windows 10 build 20348+ / Windows 11. Compilado com o csc do
// .NET Framework 4 (C# 5), que já vem no Windows: veja scripts/build-audio-helper.mjs.

using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

static class Program
{
    const int SampleRate = 48000;
    const int Channels = 2;
    const int BytesPerFrame = Channels * 2; // 16 bits

    const ushort VT_BLOB = 0x0041;
    const int AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1;
    const int PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE = 1;
    const string VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK = "VAD\\Process_Loopback";

    const int AUDCLNT_SHAREMODE_SHARED = 0;
    const uint AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
    const uint AUDCLNT_STREAMFLAGS_EVENTCALLBACK = 0x00040000;
    const uint AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM = 0x80000000;
    const uint AUDCLNT_BUFFERFLAGS_SILENT = 0x2;

    [StructLayout(LayoutKind.Sequential)]
    struct AudioClientActivationParams
    {
        public int ActivationType;
        public uint TargetProcessId;
        public int ProcessLoopbackMode;
    }

    // PROPVARIANT com um BLOB (24 bytes em x64)
    [StructLayout(LayoutKind.Sequential)]
    struct PropVariantBlob
    {
        public ushort vt;
        public ushort reserved1;
        public ushort reserved2;
        public ushort reserved3;
        public uint cbSize;
        public IntPtr pBlobData;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    struct WaveFormatEx
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceCompletionHandler
    {
        void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceAsyncOperation
    {
        void GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    // Marca o handler como "agile" (exigido pelo ActivateAudioInterfaceAsync)
    [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAgileObject { }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint streamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, IntPtr audioSessionGuid);
        [PreserveSig] int GetBufferSize(out uint numBufferFrames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint numPaddingFrames);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr pFormat, out IntPtr closestMatch);
        [PreserveSig] int GetMixFormat(out IntPtr deviceFormat);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr eventHandle);
        [PreserveSig] int GetService([MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint numFramesToRead, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint numFramesRead);
        [PreserveSig] int GetNextPacketSize(out uint numFramesInNextPacket);
    }

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    sealed class CompletionHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent Done = new ManualResetEvent(false);

        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
        {
            Done.Set();
        }
    }

    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
    static extern void ActivateAudioInterfaceAsync(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        IntPtr activationParams,
        IActivateAudioInterfaceCompletionHandler completionHandler,
        out IActivateAudioInterfaceAsyncOperation activationOperation);

    static void Check(int hr, string what)
    {
        if (hr < 0) throw new Exception(what + " falhou (HRESULT 0x" + hr.ToString("X8") + ")");
    }

    static IAudioClient ActivateExcluding(uint processId)
    {
        var activation = new AudioClientActivationParams
        {
            ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            TargetProcessId = processId,
            ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
        };
        int activationSize = Marshal.SizeOf(typeof(AudioClientActivationParams));
        IntPtr activationPtr = Marshal.AllocHGlobal(activationSize);
        IntPtr propPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(PropVariantBlob)));
        try
        {
            Marshal.StructureToPtr(activation, activationPtr, false);
            var prop = new PropVariantBlob { vt = VT_BLOB, cbSize = (uint)activationSize, pBlobData = activationPtr };
            Marshal.StructureToPtr(prop, propPtr, false);

            var handler = new CompletionHandler();
            IActivateAudioInterfaceAsyncOperation operation;
            ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, typeof(IAudioClient).GUID, propPtr, handler, out operation);
            if (!handler.Done.WaitOne(5000)) throw new Exception("Tempo esgotado ao ativar a captura de áudio");

            int hr;
            object client;
            operation.GetActivateResult(out hr, out client);
            Check(hr, "Ativar a captura por processo");
            return (IAudioClient)client;
        }
        finally
        {
            Marshal.FreeHGlobal(propPtr);
            Marshal.FreeHGlobal(activationPtr);
        }
    }

    [MTAThread]
    static int Main(string[] args)
    {
        uint excludePid;
        if (args.Length < 1 || !uint.TryParse(args[0], out excludePid))
        {
            Console.Error.WriteLine("uso: toca-audio-capture.exe <pid-a-excluir>");
            return 2;
        }

        try
        {
            IAudioClient client = ActivateExcluding(excludePid);

            var format = new WaveFormatEx
            {
                wFormatTag = 1, // PCM
                nChannels = Channels,
                nSamplesPerSec = SampleRate,
                nAvgBytesPerSec = SampleRate * BytesPerFrame,
                nBlockAlign = BytesPerFrame,
                wBitsPerSample = 16,
                cbSize = 0,
            };
            IntPtr formatPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WaveFormatEx)));
            Marshal.StructureToPtr(format, formatPtr, false);

            // Buffer de 200 ms; o processo de loopback converte para o formato pedido
            Check(client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                2000000, 0, formatPtr, IntPtr.Zero), "IAudioClient.Initialize");

            var ready = new AutoResetEvent(false);
            Check(client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle()), "IAudioClient.SetEventHandle");

            object service;
            Check(client.GetService(typeof(IAudioCaptureClient).GUID, out service), "IAudioClient.GetService");
            var capture = (IAudioCaptureClient)service;

            Check(client.Start(), "IAudioClient.Start");
            Console.Error.WriteLine("READY");

            Stream stdout = Console.OpenStandardOutput();
            byte[] buffer = new byte[SampleRate * BytesPerFrame / 10];

            while (true)
            {
                ready.WaitOne(100);
                uint packet;
                Check(capture.GetNextPacketSize(out packet), "GetNextPacketSize");
                while (packet > 0)
                {
                    IntPtr data;
                    uint frames, flags;
                    ulong devicePosition, qpcPosition;
                    Check(capture.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition), "GetBuffer");

                    int bytes = (int)frames * BytesPerFrame;
                    if (buffer.Length < bytes) buffer = new byte[bytes];
                    if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0) Array.Clear(buffer, 0, bytes);
                    else Marshal.Copy(data, buffer, 0, bytes);
                    Check(capture.ReleaseBuffer(frames), "ReleaseBuffer");

                    // Se o Toca fechar o pipe, a escrita falha e o programa termina
                    stdout.Write(buffer, 0, bytes);
                    Check(capture.GetNextPacketSize(out packet), "GetNextPacketSize");
                }
                stdout.Flush();
            }
        }
        catch (IOException)
        {
            return 0; // stdout fechado: o Toca parou o compartilhamento
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("ERRO: " + e.Message);
            return 1;
        }
    }
}
