import { BlogArticleBody, BlogProTip } from "@/components/blog/BlogShell";
import Link from "next/link";
import type { BlogPostMeta } from "@/lib/blog/types";

export const meta: BlogPostMeta = {
  slug: "como-usar-streamly-xtream-m3u",
  title:
    "Como usar o Streamly no navegador com Xtream Codes ou M3U (guia rápido)",
  description:
    "Passo a passo em português: abra o Streamly no Chrome ou no celular, entre com Xtream Codes ou playlist M3U e encontre canais, filmes e séries do seu provedor.",
  publishedAt: "2026-08-10",
  readingMinutes: 5,
  locale: "pt-BR",
  keywords: [
    "Streamly IPTV Brasil",
    "como usar Xtream Codes",
    "playlist M3U navegador",
    "player IPTV web português",
    "IPTV no Chrome",
  ],
};

export function ComoUsarStreamlyXtreamM3uContent() {
  return (
    <BlogArticleBody>
      <p className="text-lg text-(--text) leading-relaxed" lang="pt-BR">
        O <a href="https://iptvwebplayer.org">Streamly</a> é um player IPTV que
        roda no navegador — sem instalar app. Se o seu provedor te passou login
        Xtream (URL + usuário + senha) ou um link M3U, este guia mostra como
        entrar e começar a assistir em poucos minutos.
      </p>

      <p lang="pt-BR">
        Importante: o Streamly <strong>não vende pacotes</strong> nem canais. Ele
        só conecta nas credenciais que <em>você</em> já tem. Use apenas provedores
        que você está autorizado a acessar.
      </p>

      <h2 lang="pt-BR">O que você precisa</h2>
      <ul lang="pt-BR">
        <li>
          Um navegador recente (Chrome, Edge, Firefox ou Safari) no PC, notebook
          ou celular.
        </li>
        <li>
          Credenciais do provedor — de preferência{" "}
          <strong>Xtream Codes</strong> (URL do portal, usuário e senha).
        </li>
        <li>
          Ou, se for o caso, a <strong>URL da playlist M3U</strong> (às vezes
          chamada de “lista” ou “link m3u”).
        </li>
      </ul>

      <h2 lang="pt-BR">Passo 1 — Abra o player</h2>
      <p lang="pt-BR">
        Acesse{" "}
        <a href="https://iptvwebplayer.org/login">iptvwebplayer.org/login</a>.
        Você verá duas abas: <strong>Xtream Codes</strong> e <strong>M3U</strong>.
        Escolha a que combina com o que o provedor te enviou.
      </p>

      <h2 lang="pt-BR">Passo 2 — Entre com Xtream Codes (recomendado)</h2>
      <ol lang="pt-BR">
        <li>
          Cole a <strong>URL do servidor</strong> (ex.:{" "}
          <code>http://exemplo.com:8080</code> — sem o caminho{" "}
          <code>/player_api.php</code>).
        </li>
        <li>Digite o <strong>usuário</strong> e a <strong>senha</strong>.</li>
        <li>
          Toque em entrar. Em alguns segundos o catálogo de TV ao vivo, filmes e
          séries deve carregar.
        </li>
      </ol>
      <p lang="pt-BR">
        No Brasil, muitos painéis organizam filmes e séries com prefixos como{" "}
        <code>BR |</code>, <code>PT |</code> ou “Português”. O Streamly tenta
        priorizar conteúdo em português quando detecta que você está no Brasil —
        você pode mudar o filtro de idioma a qualquer momento na navegação de
        Filmes/Séries.
      </p>

      <h2 lang="pt-BR">Passo 3 — Ou cole a playlist M3U</h2>
      <p lang="pt-BR">
        Se o provedor só te deu um link único, abra a aba <strong>M3U</strong>,
        cole a URL completa e entre. Funciona bem para TV ao vivo. Filmes e
        séries em M3U puro variam bastante de painel para painel — se a lista for
        só canais, é limitação do formato, não do player.
      </p>

      <BlogProTip label="Dica">
        <p lang="pt-BR">
          Peça ao provedor <em>as duas</em> opções (Xtream e M3U) e salve no
          gerenciador de senhas. Quando o domínio do painel mudar — e isso
          acontece — você troca a URL sem perder o acesso no mesmo dia.
        </p>
      </BlogProTip>

      <h2 lang="pt-BR">Passo 4 — Encontre canais e VOD</h2>
      <ul lang="pt-BR">
        <li>
          <strong>TV ao vivo</strong> — categorias e prateleiras (esporte,
          notícias, abertas, etc.). Se o filtro de região estiver ativo, escolha{" "}
          <strong>Latin America</strong>; canais brasileiros costumam aparecer
          aí.
        </li>
        <li>
          <strong>Filmes e séries</strong> — grades com pôsteres quando o painel
          Xtream envia metadados. Filtre por idioma (Português) se a biblioteca
          misturar vários idiomas.
        </li>
        <li>
          <strong>Guia de programação (EPG)</strong> — disponível quando o
          provedor fornece EPG no Xtream; em M3U muitas vezes falta ou vem
          separado.
        </li>
      </ul>

      <h2 lang="pt-BR">Xtream ou M3U — qual escolher?</h2>
      <p lang="pt-BR">
        Resumo prático: use <strong>Xtream</strong> no dia a dia se o portal
        estiver estável (categorias, capas, episódios e EPG costumam ser
        melhores). Guarde o <strong>M3U</strong> como reserva ou para testes
        rápidos. Há um comparativo mais completo (em inglês) em{" "}
        <Link href="/blog/xtream-codes-vs-m3u">Xtream Codes vs M3U</Link>.
      </p>

      <h2 lang="pt-BR">Problemas comuns</h2>
      <ul lang="pt-BR">
        <li>
          <strong>“Não conecta”</strong> — confira se a URL tem o protocolo{" "}
          (<code>http://</code> ou <code>https://</code>) e a porta certa.
          Remova caminhos extras que o provedor às vezes cola no WhatsApp.
        </li>
        <li>
          <strong>Canal trava ou não abre</strong> — teste outro canal da mesma
          categoria. Se vários falharem, o problema costuma ser o servidor do
          provedor ou a rede, não o login.
        </li>
        <li>
          <strong>Poucos filmes em português</strong> — abra o filtro de idioma
          em Filmes/Séries e selecione Português; alguns painéis rotulam conteúdo
          BR como espanhol por engano.
        </li>
      </ul>

      <h2 lang="pt-BR">Smart TV</h2>
      <p lang="pt-BR">
        No navegador da TV (ou pelo celular na mesma rede), o fluxo de login é o
        mesmo. Há instruções por plataforma na página{" "}
        <Link href="/tv">Smart TV</Link>.
      </p>

      <h2 lang="pt-BR">Resumo</h2>
      <p lang="pt-BR">
        Abra o Streamly → escolha Xtream ou M3U → cole as credenciais do{" "}
        <em>seu</em> provedor → navegue TV, filmes e séries. Sem instalação, só
        uma aba. Se quiser hospedar a própria cópia, veja o guia de{" "}
        <Link href="/blog/how-to-self-host-streamly">self-host com Docker</Link>{" "}
        (em inglês).
      </p>

      <p className="text-sm border-t border-white/10 pt-6 mt-10" lang="pt-BR">
        <strong className="text-(--text)">Aviso:</strong> o Streamly é apenas um
        player. Não oferece assinaturas IPTV, canais nem streams protegidos por
        direitos autorais. Use somente provedores que você está autorizado a
        acessar.
      </p>
    </BlogArticleBody>
  );
}
