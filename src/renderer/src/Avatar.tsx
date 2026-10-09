export function Avatar({ name, size }: { name: string; size: number }) {
  // Cor estável por nome
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: `hsl(${hue} 45% 45%)`,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
