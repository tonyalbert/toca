# A fazer

Itens do redesign (design/IMPLEMENTAR.md) que dependem de algo que ainda não existe.

## Confirmação de e-mail e "Esqueci a senha"

As telas `scr.codigo` e `scr.esqueci` do protótipo precisam de envio de e-mail.

- [ ] Escolher o serviço de e-mail (Resend, Amazon SES ou SMTP próprio) e configurar o domínio (SPF/DKIM).
- [ ] API: códigos de 6 dígitos com validade de 15 min, guardados só como hash, com limite de tentativas.
- [ ] API: `POST /auth/verify-email`, `POST /auth/resend-code`, `POST /auth/forgot-password`, `POST /auth/reset-password`
      (trocar a senha derruba as outras sessões).
- [ ] API: decidir o que uma conta sem e-mail confirmado pode fazer (sugestão: tudo, com um aviso no app).
- [ ] App: ligar as telas "Confirme seu e-mail" e "Esqueceu a senha?" (hoje o link "Esqueci a senha" fica escondido).
- [ ] Conta antiga sem e-mail (`tony`): pedir para cadastrar um e-mail em Configurações > Perfil.

## Convite por link

Os botões "Convidar" e "Copiar convite" da sala, e "Copiar meu @" na tela de amigos vazia.

- [ ] Definir como funciona: link que adiciona à sala direto ou que só manda pedido de amizade ao dono.
- [ ] API: convites com código aleatório, validade e limite de usos; o dono pode revogar.
- [ ] App: abrir o link pelo protocolo `toca://` (registrar no electron-builder) ou colar o código no app.
- [ ] Enquanto isso, "Copiar meu @" pode entrar sozinho, porque não depende de nada novo.
