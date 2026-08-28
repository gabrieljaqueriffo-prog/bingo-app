import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Grid3X3,
  Hash,
  History,
  ImagePlus,
  Timer,
  Wifi,
  Ship,
  MoreHorizontal,
  Mic,
  MicOff,
  Palette,
  Pin,
  Plus,
  RotateCcw,
  Shapes,
  Share2,
  Undo2,
  X,
} from "lucide-react";
import { BrowserCardImageParser } from "./ocr";
import {
  cardIssues,
  completedRows,
  createGame,
  emptyRows,
  finishModality,
  fixtureGame,
  isFullCard,
  markedCount,
  modalityComplete,
  modalityRemaining,
  resetMarks,
  setModality,
  table197Game,
  table214Game,
  toggleNumber,
  undoLast,
} from "./core";
import { getGame, getLastGame, listGames, saveGame } from "./db";
import type { Card, Cell, Game, ParsedCard } from "./types";
import MentirosoApp from "./games/mentiroso/MentirosoApp";
import Conecta4App from "./games/conecta4/Conecta4App";
import Conecta4RemoteApp from "./games/conecta4/Conecta4RemoteApp";
import { parseRoomLink } from "./games/conecta4/remote";
import StopRemoteApp from "./games/stop/StopRemoteApp";
import { parseStopLink } from "./games/stop/stopRemote";
import MentirosoRemoteApp from "./games/mentiroso/MentirosoRemoteApp";
import { parseMentLink } from "./games/mentiroso/mentRemote";
import NavalApp from "./games/naval/NavApp";
import { parseNavalLink } from "./games/naval/navalRemote";
import BrosApp from "./games/bros/BrosApp";
import { parseBrosLink } from "./games/bros/remote";

type View = "loading" | "home" | "games" | "verify" | "play" | "pick" | "mentiroso" | "mentiroso-online" | "conecta4" | "conecta4-online" | "stop-online" | "naval" | "bros";
type CardView = "all" | "four" | "one";
type PlayTheme = { marked: string; marked2: string; last: string; last2: string; modality: string; modality2: string; gradient: boolean };
const defaultTheme: PlayTheme = { marked: "#ffc94a", marked2: "#ff9f2e", last: "#318df0", last2: "#705cff", modality: "#8b6cf6", modality2: "#ef5da8", gradient: true };
const parser = new BrowserCardImageParser();
const makeCard = (
  gameId: string,
  rows: Cell[][] = emptyRows(),
  n = 1,
): Card => ({ id: crypto.randomUUID(), gameId, label: `Cartón ${n}`, rows });

export default function App() {
      const [view, setView] = useState<View>(() =>
    parseBrosLink() ? "bros" : parseNavalLink() ? "naval" : parseMentLink() ? "mentiroso-online" : parseStopLink() ? "stop-online" : parseRoomLink() ? "conecta4-online" : "loading",
  ),
    [game, setGame] = useState<Game | null>(null),
    [games, setGames] = useState<Game[]>([]),
    [draft, setDraft] = useState<Card[]>([]),
    [saved, setSaved] = useState(true),
    [sheet, setSheet] = useState<"numbers" | "pattern" | "modeWin" | "theme" | "menu" | null>(null),
    [ocr, setOcr] = useState<number | null>(null),
    [notice, setNotice] = useState(""),
    [cardView, setCardView] = useState<CardView>(
      () => (localStorage.getItem("bingo-card-view") as CardView) || "four",
    ),
    [cardPage, setCardPage] = useState(0),
    [boardPinned, setBoardPinned] = useState(false),
    [playTheme, setPlayTheme] = useState<PlayTheme>(() => {
      try { return { ...defaultTheme, ...JSON.parse(localStorage.getItem("bingo-theme") || "{}") }; }
      catch { return defaultTheme; }
    });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (async () => {
      const table = new URLSearchParams(location.search).get("tabla");
      if (table === "197" || table === "214") {
        const id = `tabla-${table}`;
        const shared =
          (await getGame(id)) ||
          (table === "197" ? table197Game() : table214Game());
        await saveGame(shared);
        setGame(shared);
        setGames(await listGames());
        setView("play");
        return;
      }
      const [last, all] = await Promise.all([getLastGame(), listGames()]);
      setGames(all);
      setGame(last || null);
      setView("home");
    })();
  }, []);
  useEffect(() => {
    if (!game || view === "loading") return;
    setSaved(false);
    const t = setTimeout(async () => {
      await saveGame(game);
      setSaved(true);
      setGames(await listGames());
    }, 120);
    return () => clearTimeout(t);
  }, [game]);
  useEffect(() => {
    localStorage.setItem("bingo-card-view", cardView);
    setCardPage(0);
  }, [cardView]);
  useEffect(() => {
    localStorage.setItem("bingo-theme", JSON.stringify(playTheme));
    const paint = (first: string, second: string) => playTheme.gradient ? `linear-gradient(135deg, ${first}, ${second})` : first;
    document.documentElement.style.setProperty("--play-mark", paint(playTheme.marked, playTheme.marked2));
    document.documentElement.style.setProperty("--play-last", paint(playTheme.last, playTheme.last2));
    document.documentElement.style.setProperty("--play-mode", paint(playTheme.modality, playTheme.modality2));
    document.documentElement.style.setProperty("--play-mode-solid", playTheme.modality);
  }, [playTheme]);
  const start = (demo = false) => {
    const g = demo ? fixtureGame() : createGame();
    setGame(g);
    setDraft(demo ? g.cards : []);
    if (demo) {
      setView("play");
    } else {
      setView("verify");
    }
  };
  const update = (fn: (g: Game) => Game) => setGame((g) => (g ? fn(g) : g));
  const markNumber = (number: number, fromBoard = false) => {
    if (!game) return;
    if (game.calledNumbers.includes(number) && !confirm(`El número ${number} ya salió. ¿Seguro que deseas eliminarlo?`)) return;
    navigator.vibrate?.(18);
    update((current) => toggleNumber(current, number));
    if (fromBoard && !boardPinned) setSheet(null);
  };
  async function upload(files: FileList | null) {
    if (!files || !game) return;
    setOcr(0);
    const found: Card[] = [];
    for (const file of Array.from(files)) {
      try {
        const result = await parser.parse(file, setOcr);
        result.cards.forEach((c: ParsedCard, cardIndex) =>
          found.push({
            ...c,
            gameId: game.id,
            label: result.tableNumber
              ? `Tabla ${result.tableNumber} · Cartón ${cardIndex + 1}`
              : `Cartón ${draft.length + found.length + 1}`,
            tableNumber: result.tableNumber,
            sourceImageId: result.sourceImageId,
          }),
        );
        if (result.warnings.length) setNotice(result.warnings[0]);
      } catch {
        setNotice(
          "No pudimos leer esa imagen. Puedes introducir el cartón manualmente.",
        );
      }
    }
    setDraft((d) => [...d, ...found]);
    setOcr(null);
  }
  const confirmCards = () => {
    if (!game || !draft.length)
      return setNotice("Agrega al menos un cartón para continuar.");
    const bad = draft.flatMap((c) => cardIssues(c.rows));
    if (bad.length)
      return setNotice(
        `Revisa ${bad.length} casillas fuera del rango B‑I‑N‑G‑O.`,
      );
    setGame({ ...game, cards: draft, updatedAt: new Date().toISOString() });
    setView("play");
  };
  if (view === "loading")
    return (
      <main className="splash">
        <div className="logo-ball">B</div>
        <p>Preparando la mesita…</p>
      </main>
    );
  if (view === "home")
    return <Home
      game={game}
      setView={setView}
      onBingo={start}
      onShare={() => navigator.share?.({ title: "Mesita · Juegos para dos", url: location.href })}
    />;
  if (view === "games")
    return (
      <main className="page">
        <PageHead title="Mis partidas" back={() => setView("home")} />
        <div className="games-list">
          {games.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setGame(g);
                setView("play");
              }}
            >
              <span className="mini-ball">{g.cards.length}</span>
              <span>
                <b>{g.name}</b>
                <small>
                  {new Intl.DateTimeFormat("es", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(g.updatedAt))}{" "}
                  · {g.calledNumbers.length} marcados
                </small>
              </span>
              <ChevronRight />
            </button>
          ))}
          {!games.length && (
            <Empty
              icon={<History />}
              title="Todavía no hay partidas"
              text="Crea una nueva para empezar."
            />
          )}
        </div>
        <button className="fab" onClick={() => start()}>
          <Plus /> Nueva partida
        </button>
      </main>
    );
  if (view === "verify" && game)
    return (
      <main className="page verify">
        <PageHead title="Verifica tus cartones" back={() => setView("home")} />
        <div className="intro">
          <p>
            Corrige cualquier número antes de empezar. Cada columna admite su
            rango de Bingo.
          </p>
          <div className="ranges">
            <span>B 1–15</span>
            <span>I 16–30</span>
            <span>N 31–45</span>
            <span>G 46–60</span>
            <span>O 61–75</span>
          </div>
        </div>
        {draft.map((card, i) => (
          <EditableCard
            key={card.id}
            card={card}
            onChange={(rows) =>
              setDraft((d) =>
                d.map((c) => (c.id === card.id ? { ...c, rows } : c)),
              )
            }
            onTableChange={(tableNumber) =>
              setDraft((cards) => {
                const group = cards.filter(
                  (item) => item.sourceImageId === card.sourceImageId,
                );
                return cards.map((item) => {
                  const position = group.findIndex((same) => same.id === item.id);
                  if (position < 0) return item;
                  return {
                    ...item,
                    tableNumber: tableNumber || undefined,
                    label: tableNumber
                      ? `Tabla ${tableNumber} · Cartón ${position + 1}`
                      : `Cartón ${position + 1}`,
                  };
                });
              })
            }
            onDelete={() => setDraft((d) => d.filter((c) => c.id !== card.id))}
          />
        ))}
        {!draft.length && (
          <Empty
            icon={<Camera />}
            title="Añade una foto o un cartón"
            text="El análisis ocurre en tu teléfono. Siempre podrás corregir el resultado."
          />
        )}
        <div className="import-actions">
          <button onClick={() => input.current?.click()}>
            <ImagePlus /> Analizar imágenes
          </button>
          <button
            onClick={() =>
              setDraft((d) => [
                ...d,
                makeCard(game.id, emptyRows(), d.length + 1),
              ])
            }
          >
            <Grid3X3 /> Crear manualmente
          </button>
          <button
            onClick={() => {
              const g = fixtureGame();
              setDraft(
                g.cards.map((c, i) => ({
                  ...c,
                  gameId: game.id,
                  label: `Cartón ${i + 1}`,
                })),
              );
              setNotice("Tabla 214 cargada para probar la partida.");
            }}
          >
            <CircleHelp /> Usar tabla de prueba
          </button>
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => upload(e.target.files)}
        />
        {ocr !== null && (
          <div className="ocr">
            <Camera />
            <b>Analizando en este dispositivo… {ocr}%</b>
            <div>
              <i style={{ width: `${ocr}%` }} />
            </div>
          </div>
        )}
        <div className="confirm-bar">
          <span>
            {draft.length} {draft.length === 1 ? "cartón" : "cartones"}
          </span>
          <button className="primary" onClick={confirmCards}>
            Confirmar cartones <Check />
          </button>
        </div>
        {notice && <Toast text={notice} close={() => setNotice("")} />}
      </main>
    );
  if (view === "play" && game) {
    const mode = game.modality?.status === "active" ? game.modality : undefined;
    const distances = mode
      ? game.cards.map((c) =>
          modalityRemaining(c, game.calledNumbers, mode.cells),
        )
      : [];
    const bestMode = distances.length ? Math.min(...distances) : Infinity;
    const bingoDistances = game.cards.map(
      (card) => 24 - markedCount(card, game.calledNumbers),
    );
    const bestBingo = bingoDistances.length ? Math.min(...bingoDistances) : 24;
    const hotBingoId = game.calledNumbers.length
      ? game.cards[bingoDistances.indexOf(bestBingo)]?.id
      : undefined;
    const hotModeId = mode && game.calledNumbers.length
      ? game.cards[distances.indexOf(bestMode)]?.id
      : undefined;
    const last = game.history.at(-1);
    const pageSize = cardView === "one" ? 1 : cardView === "four" ? 4 : game.cards.length || 1;
    const totalPages = Math.max(1, Math.ceil(game.cards.length / pageSize));
    const safePage = Math.min(cardPage, totalPages - 1);
    const visibleCards =
      cardView === "all"
        ? game.cards
        : game.cards.slice(safePage * pageSize, (safePage + 1) * pageSize);
    return (
      <main className="play">
        <header className="play-head">
          <button aria-label="Volver" onClick={() => setView("home")}>
            <ArrowLeft />
          </button>
          <div>
            <b>{game.name}</b>
            <small>
              <i /> {saved ? "Guardado" : "Guardando…"}
            </small>
          </div>
          <button aria-label="Menú" onClick={() => setSheet("menu")}>
            <MoreHorizontal />
          </button>
        </header>
        {mode && (
          <section className="mode-banner">
            <button className="mode-summary" onClick={() => setSheet("pattern")}>
              <span className="mode-icon"><Shapes /></span>
              <span><small>MODALIDAD ACTIVA</small><b>{mode.name}</b></span>
              <strong>{bestMode === 0 ? "¡Forma lista!" : `A ${bestMode}`}</strong>
            </button>
            <button className="mode-finish" onClick={() => setSheet("modeWin")}>
              🏁 Alguien ganó
            </button>
          </section>
        )}
        {game.cards.length > 1 && (
          <div className="view-switch" aria-label="Vista de cartones">
            <button className={cardView === "all" ? "active" : ""} onClick={() => setCardView("all")}>Todos</button>
            <button className={cardView === "four" ? "active" : ""} onClick={() => setCardView("four")}>De 4</button>
            <button className={cardView === "one" ? "active" : ""} onClick={() => setCardView("one")}>Grande</button>
          </div>
        )}
        {cardView !== "all" && totalPages > 1 && (
          <div className="card-pager">
            <button disabled={safePage === 0} onClick={() => setCardPage((p) => Math.max(0, p - 1))}>‹ Anterior</button>
            <b>{cardView === "four" ? `Cartones ${safePage * 4 + 1}–${Math.min((safePage + 1) * 4, game.cards.length)}` : `${safePage + 1} de ${game.cards.length}`}</b>
            <button disabled={safePage === totalPages - 1} onClick={() => setCardPage((p) => Math.min(totalPages - 1, p + 1))}>Siguiente ›</button>
          </div>
        )}
        <div className={`cards-grid view-${cardView} count-${visibleCards.length}`}>
          {visibleCards.map((card) => (
            <BingoCard
              key={card.id}
              card={card}
              called={game.calledNumbers}
              last={last}
              modality={mode}
              hotMode={card.id === hotModeId}
              hotBingo={card.id === hotBingoId}
              tap={(n) => markNumber(n)}
            />
          ))}
        </div>
        {!game.cards.length && (
          <Empty
            icon={<Grid3X3 />}
            title="Esta partida no tiene cartones"
            text="Agrégalos desde el menú."
          />
        )}
        <nav className="bottom four">
          <button
            onClick={() => update(undoLast)}
            disabled={!game.history.length}
          >
            <Undo2 />
            <span>Deshacer</span>
          </button>
          <button onClick={() => setSheet("numbers")}>
            <Hash />
            <span>Tablero</span>
          </button>
          <button
            onClick={() => setSheet("pattern")}
            className={mode ? "active-tool" : ""}
          >
            <Shapes />
            <span>Modalidad</span>
          </button>
          <button onClick={() => setSheet("menu")}>
            <MoreHorizontal />
            <span>Menú</span>
          </button>
        </nav>
        {sheet === "numbers" && (
          <NumbersSheet
            game={game}
            toggle={(n) => markNumber(n, true)}
            pinned={boardPinned}
            setPinned={setBoardPinned}
            hotMode={hotModeId ? { label: game.cards.find((card) => card.id === hotModeId)?.label || "Cartón", remaining: bestMode } : undefined}
            hotBingo={hotBingoId ? { label: game.cards.find((card) => card.id === hotBingoId)?.label || "Cartón", remaining: bestBingo } : undefined}
            close={() => setSheet(null)}
          />
        )}{" "}
        {sheet === "pattern" && (
          <PatternSheet
            game={game}
            close={() => setSheet(null)}
            save={(name, cells) => {
              update((g) => setModality(g, name, cells));
              setSheet(null);
            }}
            finish={() => {
              update(finishModality);
              setSheet(null);
            }}
          />
        )}{" "}
        {sheet === "modeWin" && (
          <ModeWinSheet
            name={mode?.name || "Modalidad"}
            close={() => setSheet(null)}
            finish={() => {
              update(finishModality);
              setSheet(null);
            }}
          />
        )}{" "}
        {sheet === "theme" && (
          <ThemeSheet
            theme={playTheme}
            setTheme={setPlayTheme}
            reset={() => setPlayTheme(defaultTheme)}
            close={() => setSheet(null)}
          />
        )}{" "}
        {sheet === "menu" && (
          <MenuSheet
            game={game}
            close={() => setSheet(null)}
            pattern={() => setSheet("pattern")}
            theme={() => setSheet("theme")}
            reset={() => {
              if (
                confirm(
                  "¿Seguro que quieres borrar todas las marcas de esta partida? Los cartones se conservarán.",
                )
              ) {
                update(resetMarks);
                setSheet(null);
              }
            }}
            add={() => {
              setDraft(game.cards);
              setSheet(null);
              setView("verify");
            }}
            fresh={() => {
              setSheet(null);
              start();
            }}
          />
        )}{" "}
      </main>
    );
  }
  if (view === "pick")
    return (
      <GamePicker
        back={() => setView("home")}
        onPick={(picked) => {
          if (picked === "conecta4-online") {
            setView("conecta4-online");
          } else if (picked === "stop-online") {
            setView("stop-online");
          } else if (picked === "mentiroso-online") {
            setView("mentiroso-online");
          } else if (picked === "naval") {
            setView("naval");
          } else if (picked === "bros") {
            setView("bros");
          } else {
            start();
          }
        }}
      />
    );
  if (view === "mentiroso") return <MentirosoApp onExit={() => setView("home")} />;
  if (view === "mentiroso-online") return <MentirosoRemoteApp onExit={() => setView("home")} />;
  if (view === "naval") return <NavalApp onExit={() => setView("home")} />;
  if (view === "bros") return <BrosApp onExit={() => setView("home")} />;
  if (view === "conecta4") return <Conecta4App onExit={() => setView("home")} />;
  if (view === "conecta4-online") return <Conecta4RemoteApp onExit={() => setView("home")} />;
    if (view === "stop-online") return <StopRemoteApp onExit={() => setView("home")} />;
  return null;
}

// Deploy trigger: 2026-08-27T12:00:00Z

function Home({
  game,
  setView,
  onBingo,
  onShare,
}: {
  game: Game | null;
  setView: (view: View) => void;
  onBingo: () => void;
  onShare: () => void;
}) {
  const games = [
    { id: "bingo", letter: "B", name: "Bingo 75", desc: "Cantá línea y carta", cls: "tile-bingo", icon: <Hash /> },
    { id: "mentiroso-online", letter: "MO", name: "Mentiroso Online", desc: "Dados ocultos, en tu celu", cls: "tile-mentiroso", icon: <Wifi /> },
    { id: "conecta4-online", letter: "4G", name: "Conecta 4 Online", desc: "Cada uno en su celu", cls: "tile-c4o", icon: <Wifi /> },
    { id: "stop-online", letter: "S", name: "Stop", desc: "Letra + categorías, online", cls: "tile-stop", icon: <Timer /> },
        { id: "naval", letter: "N", name: "Batalla Naval", desc: "Hundí su flota, online", cls: "tile-naval", icon: <Ship /> },
    { id: "bros", letter: "B", name: "Super Bros", desc: "Plataformas · online · coop con etapas", cls: "tile-bros", icon: <Shapes /> },
  ] as const;

  // Frase que va rotando entre los juegos, con la pelotita saltando.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1800);
    return () => clearInterval(id);
  }, []);
  const phrases = [
    { letter: "B", title: <>Cantá <em>¡bingo!</em></>, sub: "Tus cartones, siempre contigo" },
    { letter: "M", title: <>¿Mentís o <em>dudás?</em></>, sub: "Dados ocultos, en tu celu" },
    { letter: "4", title: <>Conectá <em>cuatro</em></>, sub: "Cada uno desde su celular" },
    { letter: "S", title: <>¡<em>Stop!</em> Se terminó el tiempo</>, sub: "Categorías, online" },
  ];
  const current = phrases[tick % phrases.length];

  return (
    <main className="home">
      <header className="brand">
        <div className="logo-ball ball-cycle" key={current.letter}>{current.letter}</div>
        <span>Mesita</span>
      </header>

      <div className="float-balls" aria-hidden>
        {games.map((g, i) => (
          <span
            key={g.letter}
            className={`mini-ball2 ${g.cls}`}
            style={{ top: `${i * 52}px`, animationDelay: `${i * 0.35}s` }}
          >
            {g.letter}
          </span>
        ))}
      </div>

      <section className="hero">
        <p className="eyebrow">6 JUEGOS · ONLINE O BINGO</p>
        <h1 key={`t${tick % phrases.length}`} className="hero-swap">
          {current.title}
        </h1>
        <p key={`s${tick % phrases.length}`} className="hero-sub-swap">{current.sub}</p>
      </section>

      <section className="home-games">
        {games.map((g) => (
          <button
            key={g.id}
            className={`game-tile ${g.cls}`}
            onClick={() => (g.id === "bingo" ? onBingo() : setView(g.id as View))}
          >
            <span className="tile-icon">{g.icon}</span>
            <span className="tile-text">
              <b>{g.name}</b>
              <small>{g.desc}</small>
            </span>
            <ChevronRight />
          </button>
        ))}
      </section>

      {game && (
        <section className="home-actions">
          <button className="continue" onClick={() => setView("play")}>
            <span>
              <Clock3 />
              <b>Continuar tu bingo</b>
              <small>{game.name} · {game.calledNumbers.length} marcados</small>
            </span>
            <ChevronRight />
          </button>
        </section>
      )}

      <footer>
        <button className="text-button" onClick={() => setView("games")}>
          <History /> Mis partidas guardadas
        </button>
        <button onClick={onShare}>
          <Share2 /> Compartir
        </button>
      </footer>
    </main>
  );
}

function GamePicker({ onPick, back }: { onPick: (game: "bingo" | "mentiroso-online" | "conecta4-online" | "stop-online" | "naval" | "bros") => void; back: () => void }) {
  return (
    <main className="page">
      <PageHead title="Elegí un juego" back={back} />
      <div className="games-list">
        <button onClick={() => onPick("bingo")}>
          <span className="mini-ball">B</span>
          <span>
            <b>Bingo 75 bolas</b>
            <small>Cartones fotográficos, marcado global, modalidades</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => onPick("mentiroso-online")}>
          <span className="mini-ball">MG</span>
          <span>
            <b>Mentiroso Online</b>
            <small>Dados ocultos · cada uno desde su celular</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => onPick("conecta4-online")}>
          <span className="mini-ball">4G</span>
          <span>
            <b>Conecta 4 Online</b>
            <small>De acá a la sala: cada uno desde su celular</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => onPick("stop-online")}>
          <span className="mini-ball">S</span>
          <span>
            <b>Stop · Categorías</b>
            <small>Online · letra al azar · 6 categorías · 5 rondas</small>
          </span>
          <ChevronRight />
        </button>
                <button onClick={() => onPick("naval")}>
          <span className="mini-ball">N</span>
          <span>
            <b>Batalla Naval</b>
            <small>Online · ocultá tus barcos y hundí la flota rival</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => onPick("bros")}>
          <span className="mini-ball">B</span>
          <span>
            <b>Super Bros</b>
            <small>Plataformas · online · con etapas y enemigos</small>
          </span>
          <ChevronRight />
        </button>
      </div>
    </main>
  );
}

function PageHead({ title, back }: { title: string; back: () => void }) {
  return (
    <header className="page-head">
      <button onClick={back}>
        <ArrowLeft />
      </button>
      <h1>{title}</h1>
      <span />
    </header>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
function Toast({ text, close }: { text: string; close: () => void }) {
  return (
    <div className="toast">
      <span>{text}</span>
      <button onClick={close}>
        <X />
      </button>
    </div>
  );
}
function EditableCard({
  card,
  onChange,
  onTableChange,
  onDelete,
}: {
  card: Card;
  onChange: (r: Cell[][]) => void;
  onTableChange: (tableNumber: number) => void;
  onDelete: () => void;
}) {
  const set = (r: number, c: number, v: string) => {
    const rows = card.rows.map((x) => [...x]);
    rows[r][c] = r === 2 && c === 2 ? null : Number(v) || 0;
    onChange(rows);
  };
  return (
    <section className="edit-card">
      <header>
        <div className="edit-card-title">
          <b>{card.label}</b>
          <label className="table-field">
            <span>Tabla</span>
            <input
              inputMode="numeric"
              placeholder="Ej. 214"
              value={card.tableNumber || ""}
              onChange={(event) => onTableChange(Number(event.target.value))}
            />
          </label>
        </div>
        <span>
          {card.confidence
            ? `${Math.round(card.confidence * 100)}% confianza`
            : "Manual"}
        </span>
        <button onClick={onDelete}>
          <X />
        </button>
      </header>
      <div className="edit-grid">
        <div className="letters">
          {"BINGO".split("").map((x) => (
            <b key={x}>{x}</b>
          ))}
        </div>
        {card.rows.map((row, r) =>
          row.map((v, c) => (
            <label
              key={`${r}-${c}`}
              className={!cardIssues([[0]]).length ? "" : ""}
            >
              {r === 2 && c === 2 ? (
                <button className="free" onClick={() => set(r, c, "")}>
                  LIBRE
                </button>
              ) : (
                <input
                  inputMode="numeric"
                  value={v || ""}
                  min={1}
                  max={75}
                  aria-label={`${"BINGO"[c]} fila ${r + 1}`}
                  className={
                    cardIssues(card.rows).includes(`${"BINGO"[c]}${r + 1}`)
                      ? "invalid"
                      : ""
                  }
                  onChange={(e) => set(r, c, e.target.value)}
                />
              )}
            </label>
          )),
        )}
      </div>
    </section>
  );
}
function BingoCard({
  card,
  called,
  last,
  modality,
  hotMode,
  hotBingo,
  tap,
}: {
  card: Card;
  called: number[];
  last?: number;
  modality?: Game["modality"];
  hotMode: boolean;
  hotBingo: boolean;
  tap: (n: number) => void;
}) {
  const lines = completedRows(card, called),
    full = isFullCard(card, called),
    remaining = modality
      ? modalityRemaining(card, called, modality.cells)
      : null,
    complete = modality
      ? modalityComplete(card, called, modality.cells)
      : false;
  return (
    <article
      className={`bingo-card ${hotMode || hotBingo ? "leader hot" : ""} ${full ? "winner" : ""}`}
    >
      <header>
        <div>
          <b>{card.label}</b>
          {(hotMode || hotBingo) && <span className="hot-badge" aria-label="Cartón más cerca de ganar">🔥 HOT</span>}
        </div>
        <span>{markedCount(card, called)}/24</span>
      </header>
      {(hotMode || hotBingo) && (
        <div className="hot-reasons">
          {hotMode && <span>Modalidad</span>}
          {hotBingo && <span>Bingo completo</span>}
        </div>
      )}
      <div className="bingo-letters">
        {"BINGO".split("").map((x) => (
          <b key={x}>{x}</b>
        ))}
      </div>
      <div className="number-grid">
        {card.rows.map((row, r) =>
          row.map((v, c) => {
            const index = r * 5 + c,
              modeCell = modality?.cells.includes(index);
            return v === null ? (
              <span
                key={`${r}-${c}`}
                className={`free ${modeCell ? "mode-cell" : ""}`}
              >
                ★
              </span>
            ) : (
              <button
                key={`${r}-${c}`}
                onClick={() => tap(v)}
                className={`${called.includes(v) ? "called" : ""} ${last === v && called.includes(v) ? "last-called" : ""} ${modeCell ? "mode-cell" : ""} ${modeCell && called.includes(v) ? "mode-done" : ""}`}
                aria-pressed={called.includes(v)}
              >
                {v}
                {called.includes(v) && <Check />}
              </button>
            );
          }),
        )}
      </div>
      <footer>
        {modality
          ? complete
            ? "¡Modalidad completa!"
            : `A ${remaining} de ganar`
          : full
            ? "¡Cartón completo!"
            : lines
              ? `${lines} línea${lines > 1 ? "s" : ""} · faltan ${24 - markedCount(card, called)} para bingo`
              : `Faltan ${24 - markedCount(card, called)} para bingo`}
      </footer>
    </article>
  );
}
function Sheet({
  children,
  close,
}: {
  children: React.ReactNode;
  close: () => void;
}) {
  return (
    <div className="overlay" onClick={close}>
      <section className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="handle" />
        {children}
      </section>
    </div>
  );
}
const normalizeSpeech = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function spokenNumber(text: string) {
  const normalized = normalizeSpeech(text), digits = normalized.match(/\b([1-9]|[1-6]\d|7[0-5])\b/);
  if (digits) return Number(digits[1]);
  const first = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciseis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidos", "veintitres", "veinticuatro", "veinticinco", "veintiseis", "veintisiete", "veintiocho", "veintinueve"];
  const words: Array<[string, number]> = first.slice(1).map((word, index) => [word, index + 1]);
  [[30, "treinta"], [40, "cuarenta"], [50, "cincuenta"], [60, "sesenta"], [70, "setenta"]].forEach(([base, word]) => { words.push([word as string, base as number]); for (let unit = 1; unit <= Math.min(9, 75 - Number(base)); unit++) words.push([`${word} y ${first[unit]}`, Number(base) + unit]); });
  return words.sort((a, b) => b[0].length - a[0].length).find(([word]) => normalized.includes(word))?.[1];
}
const shortCardLabel = (label: string) => label.replace("Cartón", "C.");
function NumbersSheet({
  game,
  toggle,
  pinned,
  setPinned,
  hotMode,
  hotBingo,
  close,
}: {
  game: Game;
  toggle: (n: number) => void;
  pinned: boolean;
  setPinned: (value: boolean) => void;
  hotMode?: { label: string; remaining: number };
  hotBingo?: { label: string; remaining: number };
  close: () => void;
}) {
  const recent = game.history.slice(-3).reverse(), last = recent[0],
    recognition = useRef<any>(null),
    [listening, setListening] = useState(false),
    voiceSupported = typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const voice = () => {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    const listener = new Recognition(); recognition.current = listener; listener.lang = "es-VE"; listener.continuous = true; listener.interimResults = false;
    listener.onresult = (event: any) => { for (let index = event.resultIndex; index < event.results.length; index++) { const value = spokenNumber(event.results[index][0].transcript); if (value) toggle(value); } };
    listener.onerror = () => setListening(false); listener.onend = () => setListening(false); listener.start(); setListening(true);
  };
  return (
    <div className="number-screen">
      <header className="number-screen-head">
        <div>
          <p>CONTROL DE JUEGO</p>
          <h2>Tablero BINGO</h2>
        </div>
        <div className="board-head-actions">
          {voiceSupported && <button className={listening ? "listening" : ""} onClick={voice} aria-label={listening ? "Detener micrófono" : "Anotar números por voz"}>{listening ? <MicOff /> : <Mic />}</button>}
          <button className={pinned ? "pinned" : ""} onClick={() => setPinned(!pinned)} aria-label={pinned ? "Desfijar tablero" : "Dejar tablero fijo"}><Pin /></button>
          <button onClick={close} aria-label="Cerrar tablero"><X /></button>
        </div>
      </header>
      <div className="board-status">
        <div className="recent-balls">
          <small>ÚLTIMAS 3</small>
          <div>{[0, 1, 2].map((index) => <b key={index} className={index === 0 ? "current" : ""}>{recent[index] || "—"}</b>)}</div>
        </div>
        <div className="called-total"><strong>{game.calledNumbers.length}</strong><span>números salieron</span></div>
        <div className="board-hot">
          <b>🔥 HOT</b>
          {hotMode && <span><strong>Modalidad</strong> {shortCardLabel(hotMode.label)} · faltan {hotMode.remaining}</span>}
          {hotBingo && <span><strong>Bingo</strong> {shortCardLabel(hotBingo.label)} · faltan {hotBingo.remaining}</span>}
          {!hotMode && !hotBingo && <span>Marca una bola para ver quién lidera.</span>}
        </div>
      </div>
      <div className="board-tools-note">{pinned ? "📌 Tablero fijo: puedes marcar varios números seguidos." : "Toca una bola para marcarla y volver a los cartones."}{listening && <strong> 🎙️ Escuchando…</strong>}</div>
      <div className="board-letters">
        {"BINGO".split("").map((x) => (
          <b key={x}>{x}</b>
        ))}
      </div>
      <div className="call-board">
        {Array.from({ length: 15 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => row + 1 + col * 15),
        )
          .flat()
          .map((n) => (
            <button
              onClick={() => toggle(n)}
              className={`${game.calledNumbers.includes(n) ? "called" : ""} ${last === n && game.calledNumbers.includes(n) ? "last-called" : ""}`}
              key={n}
            >
              {n}
            </button>
          ))}
      </div>
    </div>
  );
}
function PatternSheet({
  game,
  close,
  save,
  finish,
}: {
  game: Game;
  close: () => void;
  save: (name: string, cells: number[]) => void;
  finish: () => void;
}) {
  const active = game.modality?.status === "active",
    [name, setName] = useState(
      active ? game.modality!.name : "Primera modalidad",
    ),
    [cells, setCells] = useState<number[]>(active ? game.modality!.cells : []);
  const toggle = (index: number) =>
    setCells((list) =>
      list.includes(index) ? list.filter((x) => x !== index) : [...list, index],
    );
  return (
    <Sheet close={close}>
      <header>
        <div>
          <p className="eyebrow">FORMA DEL PRIMER JUEGO</p>
          <h2>Modalidad</h2>
        </div>
        <button onClick={close}>
          <X />
        </button>
      </header>
      <p className="pattern-help">
        Marca libremente las casillas que forman la jugada ganadora.
      </p>
      <input
        className="pattern-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nombre de la modalidad"
      />
      <div className="pattern-letters">
        {"BINGO".split("").map((x) => (
          <b key={x}>{x}</b>
        ))}
      </div>
      <div className="pattern-grid">
        {Array.from({ length: 25 }, (_, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={cells.includes(i) ? "selected" : ""}
          >
            {i === 12 ? "★" : cells.includes(i) ? <Check /> : ""}
          </button>
        ))}
      </div>
      <button
        className="primary pattern-save"
        disabled={!cells.length}
        onClick={() => save(name, cells)}
      >
        <Check /> {active ? "Actualizar modalidad" : "Jugar esta modalidad"}
      </button>
      {active && (
        <button className="finish-mode" onClick={finish}>
          Alguien ganó · seguir a cartón lleno
        </button>
      )}
    </Sheet>
  );
}
function ModeWinSheet({
  name,
  close,
  finish,
}: {
  name: string;
  close: () => void;
  finish: () => void;
}) {
  return (
    <div className="celebration" role="dialog" aria-modal="true">
      <div className="confetti" aria-hidden="true">● ◆ ★ ● ◆</div>
      <button className="celebration-close" onClick={close} aria-label="Cerrar"><X /></button>
      <div className="celebration-ball">🏆</div>
      <p>¡TENEMOS GANADOR!</p>
      <h2>{name}</h2>
      <span>La primera modalidad terminó. Tus números marcados se conservan.</span>
      <button className="continue-full" onClick={finish}>
        Seguir a cartón completo <ChevronRight />
      </button>
      <button className="celebration-back" onClick={close}>Todavía no</button>
    </div>
  );
}
function ThemeSheet({
  theme,
  setTheme,
  reset,
  close,
}: {
  theme: PlayTheme;
  setTheme: (theme: PlayTheme) => void;
  reset: () => void;
  close: () => void;
}) {
  const colors: Array<{ key: "marked" | "last" | "modality"; second: "marked2" | "last2" | "modality2"; label: string }> = [
    { key: "marked", second: "marked2", label: "Número marcado" },
    { key: "last", second: "last2", label: "Última bola" },
    { key: "modality", second: "modality2", label: "Modalidad marcada" },
  ];
  const paint = (first: string, second: string) => theme.gradient ? `linear-gradient(135deg, ${first}, ${second})` : first;
  return (
    <Sheet close={close}>
      <header><div><p className="eyebrow">TU ESTILO</p><h2>Colores de juego</h2></div><button onClick={close}><X /></button></header>
      <p className="theme-help">Elige tus colores y mira inmediatamente cómo se verá la partida.</p>
      <div className="theme-preview">
        <div><small>B</small><b style={{ background: paint(theme.marked, theme.marked2) }}>22</b><span>Marcado</span></div>
        <div><small>I</small><b style={{ background: paint(theme.last, theme.last2), color: "white" }}>48</b><span>Última</span></div>
        <div><small>N</small><b style={{ background: paint(theme.modality, theme.modality2), color: "white" }}>35</b><span>Modalidad</span></div>
      </div>
      <label className="gradient-toggle"><span><b>Usar gradientes</b><small>Combina dos colores en cada ficha.</small></span><input type="checkbox" checked={theme.gradient} onChange={(event) => setTheme({ ...theme, gradient: event.target.checked })} /></label>
      <div className="color-options">
        {colors.map((item) => (
          <label key={item.key}><span><b>{item.label}</b><small>{theme.gradient ? "Color inicial y final" : "Color sólido"}</small></span><div className="color-pair"><input aria-label={`${item.label} inicial`} type="color" value={theme[item.key]} onChange={(event) => setTheme({ ...theme, [item.key]: event.target.value })} />{theme.gradient && <input aria-label={`${item.label} final`} type="color" value={theme[item.second]} onChange={(event) => setTheme({ ...theme, [item.second]: event.target.value })} />}</div></label>
        ))}
      </div>
      <button className="primary theme-done" onClick={close}><Check /> Usar estos colores</button>
      <button className="theme-reset" onClick={reset}>Restaurar colores originales</button>
    </Sheet>
  );
}
function MenuSheet({
  game,
  close,
  pattern,
  theme,
  reset,
  add,
  fresh,
}: {
  game: Game;
  close: () => void;
  pattern: () => void;
  theme: () => void;
  reset: () => void;
  add: () => void;
  fresh: () => void;
}) {
  return (
    <Sheet close={close}>
      <header>
        <div>
          <p className="eyebrow">{game.name}</p>
          <h2>Opciones de partida</h2>
        </div>
        <button onClick={close}>
          <X />
        </button>
      </header>
      <div className="menu-list">
        <button onClick={pattern}>
          <Shapes />
          <span>
            <b>Configurar modalidad</b>
            <small>Dibuja la forma del primer juego</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={theme}>
          <Palette />
          <span>
            <b>Personalizar colores</b>
            <small>Prueba cómo se verá tu partida</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={add}>
          <ImagePlus />
          <span>
            <b>Agregar cartones</b>
            <small>Foto, archivo o entrada manual</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={reset}>
          <RotateCcw />
          <span>
            <b>Reiniciar marcas</b>
            <small>Conserva todos los cartones</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={fresh}>
          <Plus />
          <span>
            <b>Nueva partida</b>
            <small>La actual permanece guardada</small>
          </span>
          <ChevronRight />
        </button>
        <button
          onClick={() =>
            navigator.share?.({ title: "Bingo", url: location.href })
          }
        >
          <Share2 />
          <span>
            <b>Compartir aplicación</b>
            <small>Los cartones no se comparten</small>
          </span>
          <ChevronRight />
        </button>
      </div>
    </Sheet>
  );
}
