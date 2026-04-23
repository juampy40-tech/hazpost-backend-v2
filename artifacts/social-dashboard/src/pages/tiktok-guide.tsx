import React, { useState } from "react";
import { SeoMeta } from "@/hooks/useSeoMeta";

type Lang = "es" | "en" | "pt";
const langLabels: Record<Lang, string> = { es: "Español", en: "English", pt: "Português" };

const S = {
  page: "min-h-screen bg-background text-foreground py-12 px-4",
  wrap: "max-w-3xl mx-auto",
  header: "flex items-center gap-3 mb-2",
  logo: "w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center",
  logoText: "text-primary font-black text-sm",
  title: "text-2xl font-bold",
  subtitle: "text-sm text-muted-foreground",
  langBar: "flex gap-2 my-6",
  langBtn: (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
      active
        ? "bg-primary text-background border-primary"
        : "border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
    }`,
  step: "flex gap-4 mb-8",
  stepNum: "w-8 h-8 rounded-full bg-primary text-background font-black text-sm flex items-center justify-center flex-shrink-0 mt-0.5",
  stepBody: "flex-1",
  stepTitle: "font-semibold text-foreground mb-1",
  stepDesc: "text-sm text-muted-foreground leading-relaxed",
  box: "bg-white/5 border border-border/40 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed mt-3",
  warn: "bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-300 leading-relaxed mt-3",
  info: "bg-primary/10 border border-primary/30 rounded-lg p-4 text-sm text-primary leading-relaxed mt-3",
  section: "mb-10",
  h2: "text-base font-bold text-foreground border-l-2 border-primary pl-3 mb-4",
  ul: "list-disc list-inside space-y-1 text-sm text-muted-foreground pl-2",
  divider: "border-t border-border/30 my-8",
  footer: "pt-8 border-t border-border/30 text-center",
  footerText: "text-xs text-muted-foreground",
  links: "flex justify-center gap-4 mt-2",
  link: "text-xs text-primary hover:underline",
  badge: "inline-block bg-primary/20 text-primary text-xs font-semibold px-2 py-0.5 rounded",
};

const img = (src: string, alt: string) => (
  <img src={src} alt={alt} className="rounded-lg border border-border/30 mt-3 w-full" />
);

const content: Record<Lang, React.ReactNode> = {
  es: (
    <>
      <div className={S.info}>
        Este tutorial explica cómo conectar tu cuenta de TikTok a <strong>hazpost</strong> para que la plataforma pueda publicar contenido automáticamente en tu nombre.
      </div>

      <div className={S.divider} />

      <section className={S.section}>
        <h2 className={S.h2}>Antes de empezar</h2>
        <ul className={S.ul}>
          <li>Debes tener una cuenta de TikTok activa.</li>
          <li>Tu cuenta de TikTok debe estar habilitada para <strong>publicar videos</strong> (no suspendida ni restringida).</li>
          <li>Necesitas acceso a tu cuenta de hazpost (si no tienes, regístrate en <a href="/register" className="text-primary hover:underline">hazpost.app/register</a>).</li>
        </ul>
      </section>

      <section className={S.section}>
        <h2 className={S.h2}>Pasos para conectar TikTok</h2>

        <div className={S.step}>
          <div className={S.stepNum}>1</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Inicia sesión en hazpost</p>
            <p className={S.stepDesc}>Entra a <a href="/login" className="text-primary hover:underline">hazpost.app</a> con tu usuario y contraseña.</p>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>2</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Ve a Configuración → Cuentas</p>
            <p className={S.stepDesc}>En el menú lateral, haz clic en <span className={S.badge}>Configuración</span> y busca la sección <strong>Cuentas de redes sociales</strong>.</p>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>3</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Haz clic en "Conectar TikTok"</p>
            <p className={S.stepDesc}>Verás el botón de TikTok. Al hacer clic, serás redirigido a la página oficial de TikTok para autorizar el acceso.</p>
            <div className={S.warn}>No compartas tu usuario ni contraseña de TikTok con nadie. hazpost nunca te los pedirá — solo usará el sistema seguro de autorización OAuth de TikTok.</div>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>4</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Autoriza los permisos en TikTok</p>
            <p className={S.stepDesc}>TikTok te mostrará una pantalla con los permisos que hazpost solicita:</p>
            <div className={S.box}>
              <p className="font-semibold mb-2">Permisos solicitados:</p>
              <ul className={S.ul}>
                <li><strong>user.info.basic</strong> — Ver tu nombre y avatar de TikTok.</li>
                <li><strong>video.publish</strong> — Publicar videos directamente en tu perfil.</li>
                <li><strong>video.upload</strong> — Subir archivos de video para programarlos.</li>
              </ul>
              <p className="mt-2 text-xs">Estos permisos son los mínimos necesarios para que hazpost pueda publicar en tu cuenta. <strong>No incluyen acceso a tus mensajes, seguidores ni información privada.</strong></p>
            </div>
            <p className={S.stepDesc + " mt-2"}>Haz clic en <strong>"Authorize"</strong> o <strong>"Confirmar"</strong> en la página de TikTok.</p>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>5</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>¡Listo! TikTok conectado</p>
            <p className={S.stepDesc}>Serás redirigido de vuelta a hazpost. Tu cuenta de TikTok aparecerá conectada en la sección de Cuentas. A partir de ahora, el contenido programado se publicará automáticamente.</p>
            <div className={S.info}>Si ves un error, asegúrate de que tu cuenta de TikTok no tenga restricciones de publicación y vuelve a intentarlo.</div>
          </div>
        </div>
      </section>

      <div className={S.divider} />

      <section className={S.section}>
        <h2 className={S.h2}>¿Cómo desconectar TikTok?</h2>
        <p className="text-sm text-muted-foreground mb-3">Puedes revocar el acceso en cualquier momento desde dos lugares:</p>
        <div className={S.step}>
          <div className={S.stepNum}>A</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Desde hazpost</p>
            <p className={S.stepDesc}>Ve a <span className={S.badge}>Configuración</span> → <strong>Cuentas de redes sociales</strong> → haz clic en <strong>"Desconectar"</strong> junto a tu cuenta de TikTok. El token de acceso se elimina inmediatamente del sistema.</p>
          </div>
        </div>
        <div className={S.step}>
          <div className={S.stepNum}>B</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Desde TikTok directamente</p>
            <p className={S.stepDesc}>En la app de TikTok: <strong>Perfil → ··· → Configuración → Privacidad → Aplicaciones y sitios web autorizados</strong> → busca <em>hazpost</em> y revoca el acceso.</p>
          </div>
        </div>
      </section>

      <div className={S.divider} />

      <section className={S.section}>
        <h2 className={S.h2}>Preguntas frecuentes</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">¿hazpost puede ver mis mensajes privados de TikTok?</p>
            <p className="text-sm text-muted-foreground mt-1">No. Solo se solicitan permisos de publicación de videos. No hay acceso a mensajes, seguidores, ni datos privados.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">¿Se puede publicar en múltiples cuentas de TikTok?</p>
            <p className="text-sm text-muted-foreground mt-1">Depende de tu plan. Los planes Business y Agency permiten conectar múltiples cuentas. Consulta la sección de Negocios en tu dashboard.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">¿Qué pasa si mi token de TikTok expira?</p>
            <p className="text-sm text-muted-foreground mt-1">hazpost renueva los tokens automáticamente. Si el token expira sin posibilidad de renovación, recibirás una notificación para reconectar tu cuenta.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">¿Por qué TikTok muestra "Sandbox mode"?</p>
            <p className="text-sm text-muted-foreground mt-1">Mientras la app de hazpost esté en revisión por TikTok, solo las cuentas autorizadas pueden conectarse. Si ves este mensaje, escribe a <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a> para que te agreguemos.</p>
          </div>
        </div>
      </section>
    </>
  ),

  en: (
    <>
      <div className={S.info}>
        This tutorial explains how to connect your TikTok account to <strong>hazpost</strong> so the platform can automatically publish content on your behalf.
      </div>

      <div className={S.divider} />

      <section className={S.section}>
        <h2 className={S.h2}>Before you start</h2>
        <ul className={S.ul}>
          <li>You must have an active TikTok account.</li>
          <li>Your TikTok account must be enabled to <strong>publish videos</strong> (not suspended or restricted).</li>
          <li>You need access to your hazpost account (if not, sign up at <a href="/register" className="text-primary hover:underline">hazpost.app/register</a>).</li>
        </ul>
      </section>

      <section className={S.section}>
        <h2 className={S.h2}>Steps to connect TikTok</h2>

        <div className={S.step}>
          <div className={S.stepNum}>1</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Log in to hazpost</p>
            <p className={S.stepDesc}>Go to <a href="/login" className="text-primary hover:underline">hazpost.app</a> and sign in with your username and password.</p>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>2</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Go to Settings → Accounts</p>
            <p className={S.stepDesc}>In the side menu, click <span className={S.badge}>Settings</span> and find the <strong>Social Media Accounts</strong> section.</p>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>3</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Click "Connect TikTok"</p>
            <p className={S.stepDesc}>You will see the TikTok button. Clicking it will redirect you to TikTok's official page to authorize access.</p>
            <div className={S.warn}>Never share your TikTok username or password with anyone. hazpost will never ask for them — it only uses TikTok's secure OAuth authorization system.</div>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>4</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Authorize permissions on TikTok</p>
            <p className={S.stepDesc}>TikTok will show you a screen with the permissions hazpost is requesting:</p>
            <div className={S.box}>
              <p className="font-semibold mb-2">Requested permissions:</p>
              <ul className={S.ul}>
                <li><strong>user.info.basic</strong> — View your TikTok name and avatar.</li>
                <li><strong>video.publish</strong> — Publish videos directly to your profile.</li>
                <li><strong>video.upload</strong> — Upload video files for scheduled posting.</li>
              </ul>
              <p className="mt-2 text-xs">These are the minimum permissions needed for hazpost to publish on your account. <strong>They do not include access to your messages, followers, or private information.</strong></p>
            </div>
            <p className={S.stepDesc + " mt-2"}>Click <strong>"Authorize"</strong> or <strong>"Confirm"</strong> on the TikTok page.</p>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>5</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Done! TikTok connected</p>
            <p className={S.stepDesc}>You will be redirected back to hazpost. Your TikTok account will appear connected in the Accounts section. From now on, scheduled content will be published automatically.</p>
            <div className={S.info}>If you see an error, make sure your TikTok account has no publishing restrictions and try again.</div>
          </div>
        </div>
      </section>

      <div className={S.divider} />

      <section className={S.section}>
        <h2 className={S.h2}>How to disconnect TikTok?</h2>
        <p className="text-sm text-muted-foreground mb-3">You can revoke access at any time from two places:</p>
        <div className={S.step}>
          <div className={S.stepNum}>A</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>From hazpost</p>
            <p className={S.stepDesc}>Go to <span className={S.badge}>Settings</span> → <strong>Social Media Accounts</strong> → click <strong>"Disconnect"</strong> next to your TikTok account. The access token is immediately removed from the system.</p>
          </div>
        </div>
        <div className={S.step}>
          <div className={S.stepNum}>B</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Directly from TikTok</p>
            <p className={S.stepDesc}>In the TikTok app: <strong>Profile → ··· → Settings → Privacy → Authorized Apps and Websites</strong> → find <em>hazpost</em> and revoke access.</p>
          </div>
        </div>
      </section>

      <div className={S.divider} />

      <section className={S.section}>
        <h2 className={S.h2}>Frequently asked questions</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Can hazpost see my TikTok private messages?</p>
            <p className="text-sm text-muted-foreground mt-1">No. Only video publishing permissions are requested. There is no access to messages, followers, or private data.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Can I publish to multiple TikTok accounts?</p>
            <p className="text-sm text-muted-foreground mt-1">It depends on your plan. Business and Agency plans allow connecting multiple accounts. Check the Businesses section in your dashboard.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">What happens if my TikTok token expires?</p>
            <p className="text-sm text-muted-foreground mt-1">hazpost automatically renews tokens. If a token expires and cannot be renewed, you will receive a notification to reconnect your account.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Why does TikTok show "Sandbox mode"?</p>
            <p className="text-sm text-muted-foreground mt-1">While the hazpost app is under TikTok review, only authorized test accounts can connect. If you see this message, write to <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a> to be added.</p>
          </div>
        </div>
      </section>
    </>
  ),

  pt: (
    <>
      <div className={S.info}>
        Este tutorial explica como conectar sua conta do TikTok ao <strong>hazpost</strong> para que a plataforma possa publicar conteúdo automaticamente em seu nome.
      </div>

      <div className={S.divider} />

      <section className={S.section}>
        <h2 className={S.h2}>Antes de começar</h2>
        <ul className={S.ul}>
          <li>Você deve ter uma conta ativa no TikTok.</li>
          <li>Sua conta do TikTok deve estar habilitada para <strong>publicar vídeos</strong> (não suspensa ou restrita).</li>
          <li>Você precisa ter acesso à sua conta hazpost (se não tiver, cadastre-se em <a href="/register" className="text-primary hover:underline">hazpost.app/register</a>).</li>
        </ul>
      </section>

      <section className={S.section}>
        <h2 className={S.h2}>Passos para conectar o TikTok</h2>

        <div className={S.step}>
          <div className={S.stepNum}>1</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Entre no hazpost</p>
            <p className={S.stepDesc}>Acesse <a href="/login" className="text-primary hover:underline">hazpost.app</a> e faça login com seu usuário e senha.</p>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>2</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Vá em Configurações → Contas</p>
            <p className={S.stepDesc}>No menu lateral, clique em <span className={S.badge}>Configurações</span> e encontre a seção <strong>Contas de redes sociais</strong>.</p>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>3</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Clique em "Conectar TikTok"</p>
            <p className={S.stepDesc}>Você verá o botão do TikTok. Ao clicar, será redirecionado para a página oficial do TikTok para autorizar o acesso.</p>
            <div className={S.warn}>Nunca compartilhe seu usuário ou senha do TikTok com ninguém. O hazpost nunca pedirá isso — ele usa apenas o sistema seguro de autorização OAuth do TikTok.</div>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>4</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Autorize as permissões no TikTok</p>
            <p className={S.stepDesc}>O TikTok exibirá uma tela com as permissões que o hazpost está solicitando:</p>
            <div className={S.box}>
              <p className="font-semibold mb-2">Permissões solicitadas:</p>
              <ul className={S.ul}>
                <li><strong>user.info.basic</strong> — Ver seu nome e avatar do TikTok.</li>
                <li><strong>video.publish</strong> — Publicar vídeos diretamente no seu perfil.</li>
                <li><strong>video.upload</strong> — Enviar arquivos de vídeo para agendamento.</li>
              </ul>
              <p className="mt-2 text-xs">Estas são as permissões mínimas necessárias para o hazpost publicar na sua conta. <strong>Não incluem acesso a mensagens, seguidores ou informações privadas.</strong></p>
            </div>
            <p className={S.stepDesc + " mt-2"}>Clique em <strong>"Autorizar"</strong> ou <strong>"Confirmar"</strong> na página do TikTok.</p>
          </div>
        </div>

        <div className={S.step}>
          <div className={S.stepNum}>5</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Pronto! TikTok conectado</p>
            <p className={S.stepDesc}>Você será redirecionado de volta ao hazpost. Sua conta do TikTok aparecerá conectada na seção de Contas. A partir de agora, o conteúdo agendado será publicado automaticamente.</p>
            <div className={S.info}>Se encontrar um erro, verifique se sua conta do TikTok não tem restrições de publicação e tente novamente.</div>
          </div>
        </div>
      </section>

      <div className={S.divider} />

      <section className={S.section}>
        <h2 className={S.h2}>Como desconectar o TikTok?</h2>
        <p className="text-sm text-muted-foreground mb-3">Você pode revogar o acesso a qualquer momento de dois lugares:</p>
        <div className={S.step}>
          <div className={S.stepNum}>A</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Pelo hazpost</p>
            <p className={S.stepDesc}>Vá em <span className={S.badge}>Configurações</span> → <strong>Contas de redes sociais</strong> → clique em <strong>"Desconectar"</strong> ao lado da sua conta do TikTok. O token de acesso é removido imediatamente do sistema.</p>
          </div>
        </div>
        <div className={S.step}>
          <div className={S.stepNum}>B</div>
          <div className={S.stepBody}>
            <p className={S.stepTitle}>Diretamente pelo TikTok</p>
            <p className={S.stepDesc}>No app do TikTok: <strong>Perfil → ··· → Configurações → Privacidade → Apps e sites autorizados</strong> → encontre <em>hazpost</em> e revogue o acesso.</p>
          </div>
        </div>
      </section>

      <div className={S.divider} />

      <section className={S.section}>
        <h2 className={S.h2}>Perguntas frequentes</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">O hazpost pode ver minhas mensagens privadas do TikTok?</p>
            <p className="text-sm text-muted-foreground mt-1">Não. Apenas permissões de publicação de vídeos são solicitadas. Não há acesso a mensagens, seguidores ou dados privados.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Posso publicar em várias contas do TikTok?</p>
            <p className="text-sm text-muted-foreground mt-1">Depende do seu plano. Os planos Business e Agency permitem conectar várias contas. Consulte a seção Negócios no seu painel.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">O que acontece se meu token do TikTok expirar?</p>
            <p className="text-sm text-muted-foreground mt-1">O hazpost renova os tokens automaticamente. Se um token expirar sem possibilidade de renovação, você receberá uma notificação para reconectar sua conta.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Por que o TikTok mostra "Modo sandbox"?</p>
            <p className="text-sm text-muted-foreground mt-1">Enquanto o app hazpost estiver em análise pelo TikTok, apenas contas de teste autorizadas podem se conectar. Se vir essa mensagem, escreva para <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a> para ser adicionado.</p>
          </div>
        </div>
      </section>
    </>
  ),
};

export default function TikTokGuide() {
  const [lang, setLang] = useState<Lang>("es");
  const titles: Record<Lang, string> = {
    es: "Cómo conectar TikTok a hazpost",
    en: "How to connect TikTok to hazpost",
    pt: "Como conectar o TikTok ao hazpost",
  };

  return (
    <div className={S.page}>
      <SeoMeta
        title="Cómo conectar TikTok a HazPost — Guía paso a paso"
        description="Aprende a conectar tu cuenta de TikTok Business a HazPost para publicar videos automáticamente con Inteligencia Artificial. Tutorial paso a paso."
        canonical="https://hazpost.app/tiktok-guide"
        ogUrl="https://hazpost.app/tiktok-guide"
        ogImage="https://hazpost.app/opengraph.jpg"
      />
      <div className={S.wrap}>
        <div className={S.header}>
          <div className={S.logo}><span className={S.logoText}>hp</span></div>
          <div>
            <div className={S.title}><span style={{ color: "#fff" }}>haz</span><span style={{ color: "#00C2FF" }}>post</span></div>
            <h1 className={S.subtitle}>{titles[lang]}</h1>
          </div>
        </div>

        <div className={S.langBar}>
          {(["es", "en", "pt"] as Lang[]).map(l => (
            <button key={l} onClick={() => setLang(l)} className={S.langBtn(lang === l)}>
              {langLabels[l]}
            </button>
          ))}
        </div>

        {content[lang]}

        <div className={S.footer}>
          <p className={S.footerText}>© 2026 hazpost — Social Media con IA</p>
          <div className={S.links}>
            <a href="/terms-of-service" className={S.link}>Términos de Servicio</a>
            <a href="/privacy-policy" className={S.link}>Política de Privacidad</a>
            <a href="mailto:info@hazpost.app" className={S.link}>Soporte</a>
          </div>
        </div>
      </div>
    </div>
  );
}
