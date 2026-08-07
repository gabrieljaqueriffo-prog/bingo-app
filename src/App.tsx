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
  MoreHorizontal,
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
  nearestLine,
  resetMarks,
  setModality,
  table197Game,
  table214Game,
  toggleNumber,
  undoLast,
} from "./core";
import { getGame, getLastGame, listGames, saveGame } from "./db";
import type { Card, Cell, Game, ParsedCard } from "./types";

type View = "loading" | "home" | "games" | "verify" | "play";
type CardView = "all" | "four" | "one";
const parser = new BrowserCardImageParser();
const makeCard = (
  gameId: string,
  rows: Cell[][] = emptyRows(),
  n = 1,
): Card => ({ id: crypto.randomUUID(), gameId, label: `Cartón ${n}`, rows });

export default function App() {
  const [view, setView] = useState<View>("loading"),
    [game, setGame] = useState<Game | null>(null),
    [games, setGames] = useState<Game[]>([]),
    [draft, setDraft] = useState<Card[]>([]),
    [saved, setSaved] = useState(true),
    [sheet, setSheet] = useState<"numbers" | "pattern" | "menu" | null>(null),
    [ocr, setOcr] = useState<number | null>(null),
    [notice, setNotice] = useState(""),
    [cardView, setCardView] = useState<CardView>(
      () => (localStorage.getItem("bingo-card-view") as CardView) || "four",
    ),
    [cardPage, setCardPage] = useState(0);
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
        <p>Preparando tus cartones…</p>
      </main>
    );
  if (view === "home")
    return (
      <main className="home">
        <header className="brand">
          <div className="logo-ball">B</div>
          <span>Bingo</span>
        </header>
        <section className="hero">
          <p className="eyebrow">TUS CARTONES, SIEMPRE CONTIGO</p>
          <h1>
            Listos para cantar
            <br />
            <em>¡Bingo!</em>
          </h1>
          <p>
            Fotografía tus cartones, revisa los números y juega sin perder una
            sola marca.
          </p>
        </section>
        <section className="home-actions">
          <button className="primary" onClick={() => start()}>
            <Plus /> Nueva partida <ChevronRight />
          </button>
          {game && (
            <button className="continue" onClick={() => setView("play")}>
              <span>
                <Clock3 />
                <b>Continuar partida</b>
                <small>
                  {game.name} · {game.calledNumbers.length} marcados
                </small>
              </span>
              <ChevronRight />
            </button>
          )}
          <button className="text-button" onClick={() => setView("games")}>
            <History /> Mis partidas
          </button>
        </section>
        <footer>
          <span>Guardado en este dispositivo</span>
          <button
            onClick={() =>
              navigator.share?.({ title: "Bingo", url: location.href })
            }
          >
            <Share2 /> Compartir app
          </button>
        </footer>
      </main>
    );
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
          <button className="mode-banner" onClick={() => setSheet("pattern")}>
            <Shapes />
            <b>{mode.name}</b>
            <span>
              {bestMode === 0
                ? "¡Un cartón completó la forma!"
                : `El mejor está a ${bestMode}`}
            </span>
            <ChevronRight />
          </button>
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
              tap={(n) => {
                navigator.vibrate?.(18);
                update((g) => toggleNumber(g, n));
              }}
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
            toggle={(n) => {
              update((g) => toggleNumber(g, n));
              setSheet(null);
            }}
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
        {sheet === "menu" && (
          <MenuSheet
            game={game}
            close={() => setSheet(null)}
            pattern={() => setSheet("pattern")}
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
  return null;
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
  onDelete,
}: {
  card: Card;
  onChange: (r: Cell[][]) => void;
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
        <b>{card.label}</b>
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
    near = nearestLine(card, called),
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
                className={`free ${modeCell ? "mode-cell mode-done" : ""}`}
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
              ? `${lines} línea${lines > 1 ? "s" : ""} completa${lines > 1 ? "s" : ""}`
              : near <= 2
                ? `A ${near} de una línea`
                : "En juego"}
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
function NumbersSheet({
  game,
  toggle,
  close,
}: {
  game: Game;
  toggle: (n: number) => void;
  close: () => void;
}) {
  const last = game.history.at(-1);
  return (
    <Sheet close={close}>
      <header>
        <div>
          <p className="eyebrow">ANOTA LAS BOLAS</p>
          <h2>Tablero general</h2>
        </div>
        <button onClick={close}>
          <X />
        </button>
      </header>
      {last && (
        <div className="last-ball">
          <small>ÚLTIMA BOLA</small>
          <b>{last}</b>
          <span>{game.calledNumbers.length} de 75 salidos</span>
        </div>
      )}
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
      <p className="board-help">
        Toca cualquier número que salga. Se marcará en todos tus cartones.
      </p>
    </Sheet>
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
function MenuSheet({
  game,
  close,
  pattern,
  reset,
  add,
  fresh,
}: {
  game: Game;
  close: () => void;
  pattern: () => void;
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
