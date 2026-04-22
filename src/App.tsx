import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Cell = {
  letter: string | null;
  locked: boolean;
};

type Pos = { r: number; c: number };

type Agent = {
  id: number;
  letter: string;
  pos: Pos;
  spawnSide: "top" | "right" | "bottom" | "left";
  settled: boolean;
};

type FoundWord = {
  word: string;
  start: Pos;
  direction: "horizontal" | "vertical";
  length: number;
  points: number;
};

const GRID_SIZE = 30;
const TICK_MS = 220;
const SPAWN_MS = 900;
const ALPHABET =
  "EEEEEEEEEEEEAAAAAAAARRRRRRIIIIIIOOOOOTTNNNSSSLLLCCDDUUMMBBFFGGHHPPVVWWYYKJXQZ";

const DICTIONARY = new Set([
  "CAT",
  "DOG",
  "SUN",
  "MOON",
  "STAR",
  "WORD",
  "GRID",
  "GAME",
  "PATH",
  "FLOW",
  "GOAL",
  "CODE",
  "BOOK",
  "TREE",
  "BIRD",
  "FISH",
  "FIRE",
  "WATER",
  "EARTH",
  "WIND",
  "STONE",
  "LIGHT",
  "DARK",
  "RING",
  "LINE",
  "POINT",
  "MATH",
  "ROUTE",
  "ROUTER",
  "TRACE",
  "TRACK",
  "STACK",
  "BLOCK",
  "CELL",
  "CROSS",
  "ARROW",
  "CURSOR",
  "BOARD",
  "MOVE",
  "MOVER",
  "ALPHA",
  "BETA",
  "DELTA",
  "OMEGA",
  "TIME",
  "TIMER",
  "SCORE",
  "PLAYER",
  "PLAY",
  "PLAN",
  "PLANE",
  "TRAIN",
  "BOAT",
  "ROAD",
  "RIVER",
  "HOUSE",
  "HOME",
  "ROOM",
  "DOOR",
  "WALL",
  "NOTE",
  "TONE",
  "SAND",
  "SOUND",
  "FIELD",
  "VECTOR",
  "GRAPH",
  "SEARCH",
  "COST",
  "HEAT",
  "BRAIN",
  "HEART",
  "HAND",
  "EYE",
  "FACE",
  "APPLE",
  "GRAPE",
  "PEAR",
  "BERRY",
  "MANGO",
  "LEMON",
  "MELON",
  "BANANA",
  "KIWI",
  "PLUM",
  "PEACH",
  "CHAIR",
  "TABLE",
  "PHONE",
  "CLOCK",
  "MOUSE",
  "BOARD",
  "SCREEN",
  "PIXEL",
  "REACT",
  "STATE",
  "HOOK",
  "INPUT",
  "OUTPUT",
  "LEVEL",
  "LASER",
  "SOLAR",
  "LUNAR",
  "NOVA",
  "ATOM",
  "ION",
  "METAL",
  "WAVE",
  "SIGNAL",
  "CHAIN",
  "LINK",
  "NODE",
  "NET",
  "WIRE",
  "VIA",
  "LAYER",
  "FRONT",
  "BACK",
  "SHIFT",
  "SPACE",
  "RANDOM",
  "TARGET",
  "AGENT",
  "AGENTS",
  "LOGIC",
  "ARRAY",
  "QUEUE",
  "BFS",
  "DIJKSTRA",
]);

function makeEmptyGrid(): Cell[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ letter: null, locked: false })),
  );
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
}

function cloneGrid(grid: Cell[][]) {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

function keyOf(pos: Pos) {
  return `${pos.r},${pos.c}`;
}

function randomLetter() {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

function scoreForLength(length: number) {
  if (length <= 2) return 0;
  if (length === 3) return 100;
  if (length === 4) return 250;
  if (length === 5) return 450;
  if (length === 6) return 700;
  return 1000 + (length - 7) * 250;
}

function getSpawnPoint(goal: Pos): { pos: Pos; side: Agent["spawnSide"] } {
  const sideIndex = Math.floor(Math.random() * 4);
  const side = ["top", "right", "bottom", "left"][sideIndex] as Agent["spawnSide"];

  if (side === "top") return { pos: { r: 0, c: goal.c }, side };
  if (side === "bottom") return { pos: { r: GRID_SIZE - 1, c: goal.c }, side };
  if (side === "left") return { pos: { r: goal.r, c: 0 }, side };
  return { pos: { r: goal.r, c: GRID_SIZE - 1 }, side };
}

function nearestAvailableTarget(grid: Cell[][], goal: Pos): Pos | null {
  if (!grid[goal.r][goal.c].locked) return goal;

  const visited = new Set<string>([keyOf(goal)]);
  const queue: Pos[] = [goal];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;

    for (const [dr, dc] of dirs) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (!inBounds(nr, nc)) continue;
      const next = { r: nr, c: nc };
      const k = keyOf(next);
      if (visited.has(k)) continue;
      visited.add(k);
      if (!grid[nr][nc].locked) return next;
      queue.push(next);
    }
  }

  return null;
}

function buildCostField(grid: Cell[][], target: Pos): number[][] {
  const inf = 1e9;
  const cost = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(inf));
  const queue: Pos[] = [target];
  let head = 0;
  cost[target.r][target.c] = 0;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (head < queue.length) {
    const cur = queue[head++];
    for (const [dr, dc] of dirs) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (!inBounds(nr, nc)) continue;
      if (grid[nr][nc].locked && !(nr === target.r && nc === target.c)) continue;
      if (cost[nr][nc] <= cost[cur.r][cur.c] + 1) continue;
      cost[nr][nc] = cost[cur.r][cur.c] + 1;
      queue.push({ r: nr, c: nc });
    }
  }

  return cost;
}

function bestFallbackCell(
  grid: Cell[][],
  start: Pos,
  target: Pos,
  cost: number[][],
): Pos {
  let best = start;
  let bestGoalDistance = Math.abs(start.r - target.r) + Math.abs(start.c - target.c);
  let bestRouteCost = cost[start.r][start.c];

  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      if (grid[r][c].locked) continue;
      const routeCost = cost[r][c];
      const goalDistance = Math.abs(r - target.r) + Math.abs(c - target.c);
      const betterGoal = goalDistance < bestGoalDistance;
      const sameGoalBetterRoute =
        goalDistance === bestGoalDistance && routeCost < bestRouteCost;
      if (betterGoal || sameGoalBetterRoute) {
        best = { r, c };
        bestGoalDistance = goalDistance;
        bestRouteCost = routeCost;
      }
    }
  }

  return best;
}

function nextStepToward(cost: number[][], pos: Pos): Pos | null {
  const here = cost[pos.r][pos.c];
  if (!Number.isFinite(here) || here >= 1e9 || here === 0) return null;

  const candidates = [
    { r: pos.r - 1, c: pos.c },
    { r: pos.r + 1, c: pos.c },
    { r: pos.r, c: pos.c - 1 },
    { r: pos.r, c: pos.c + 1 },
  ].filter((candidate) => inBounds(candidate.r, candidate.c));

  let best: Pos | null = null;
  let bestCost = here;
  for (const candidate of candidates) {
    const value = cost[candidate.r][candidate.c];
    if (value < bestCost) {
      bestCost = value;
      best = candidate;
    }
  }

  return best;
}

function findWords(grid: Cell[][]): FoundWord[] {
  const found: FoundWord[] = [];
  const seen = new Set<string>();

  const scanLine = (
    cells: string[],
    fixedIndex: number,
    direction: "horizontal" | "vertical",
  ) => {
    let start = 0;
    while (start < cells.length) {
      while (start < cells.length && !cells[start]) start += 1;
      let end = start;
      while (end < cells.length && cells[end]) end += 1;
      const segment = cells.slice(start, end).join("");
      if (segment.length >= 3) {
        for (let i = 0; i < segment.length; i += 1) {
          for (let j = i + 3; j <= segment.length; j += 1) {
            const word = segment.slice(i, j);
            if (!DICTIONARY.has(word)) continue;
            const actualStart = start + i;
            const key = `${direction}:${fixedIndex}:${actualStart}:${word}`;
            if (seen.has(key)) continue;
            seen.add(key);
            found.push({
              word,
              start:
                direction === "horizontal"
                  ? { r: fixedIndex, c: actualStart }
                  : { r: actualStart, c: fixedIndex },
              direction,
              length: word.length,
              points: scoreForLength(word.length),
            });
          }
        }
      }
      start = end + 1;
    }
  };

  for (let r = 0; r < GRID_SIZE; r += 1) {
    scanLine(
      grid[r].map((cell) => cell.letter ?? ""),
      r,
      "horizontal",
    );
  }

  for (let c = 0; c < GRID_SIZE; c += 1) {
    const col = Array.from({ length: GRID_SIZE }, (_, r) => grid[r][c].letter ?? "");
    scanLine(col, c, "vertical");
  }

  return found;
}

export default function App() {
  const [grid, setGrid] = useState<Cell[][]>(() => makeEmptyGrid());
  const [goal, setGoal] = useState<Pos>({ r: 14, c: 14 });
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [running, setRunning] = useState(true);
  const [gameEnded, setGameEnded] = useState(false);
  const [spawnCountdown, setSpawnCountdown] = useState(SPAWN_MS);
  const [score, setScore] = useState(0);
  const [words, setWords] = useState<FoundWord[]>([]);
  const [spawnedCount, setSpawnedCount] = useState(0);
  const [settledCount, setSettledCount] = useState(0);
  const [showCost, setShowCost] = useState(false);
  const [tickCount, setTickCount] = useState(0);
  const nextAgentId = useRef(1);

  const freeCells = useMemo(() => {
    let free = 0;
    for (let r = 0; r < GRID_SIZE; r += 1) {
      for (let c = 0; c < GRID_SIZE; c += 1) {
        if (!grid[r][c].locked) free += 1;
      }
    }
    return free;
  }, [grid]);

  const targetCell = useMemo(() => nearestAvailableTarget(grid, goal), [grid, goal]);
  const costField = useMemo(() => {
    if (!targetCell) return null;
    return buildCostField(grid, targetCell);
  }, [grid, targetCell]);

  const endGame = useCallback(() => {
    setRunning(false);
    setGameEnded(true);
    const found = findWords(grid);
    setWords(found);
    setScore(found.reduce((sum, word) => sum + word.points, 0));
  }, [grid]);

  const resetGame = useCallback(() => {
    setGrid(makeEmptyGrid());
    setGoal({ r: 14, c: 14 });
    setActiveAgent(null);
    setRunning(true);
    setGameEnded(false);
    setSpawnCountdown(SPAWN_MS);
    setScore(0);
    setWords([]);
    setSpawnedCount(0);
    setSettledCount(0);
    setShowCost(false);
    setTickCount(0);
    nextAgentId.current = 1;
  }, []);

  useEffect(() => {
    if (!running || gameEnded) return;
    if (freeCells === 0) {
      endGame();
    }
  }, [freeCells, running, gameEnded, endGame]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (gameEnded) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        setGoal((prev) => {
          let { r, c } = prev;
          if (event.key === "ArrowUp") r -= 1;
          if (event.key === "ArrowDown") r += 1;
          if (event.key === "ArrowLeft") c -= 1;
          if (event.key === "ArrowRight") c += 1;
          return {
            r: Math.max(0, Math.min(GRID_SIZE - 1, r)),
            c: Math.max(0, Math.min(GRID_SIZE - 1, c)),
          };
        });
      }
      if (event.key === " ") {
        event.preventDefault();
        setRunning((value) => !value);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameEnded]);

  useEffect(() => {
    if (!running || gameEnded) return;
    const timer = window.setInterval(() => {
      setTickCount((value) => value + 1);

      setSpawnCountdown((prev) => {
        const next = prev - TICK_MS;
        if (next > 0 || activeAgent || freeCells === 0) return next;

        const { pos, side } = getSpawnPoint(goal);
        if (grid[pos.r][pos.c].locked) {
          return SPAWN_MS;
        }

        setActiveAgent({
          id: nextAgentId.current,
          letter: randomLetter(),
          pos,
          spawnSide: side,
          settled: false,
        });
        nextAgentId.current += 1;
        setSpawnedCount((value) => value + 1);
        return SPAWN_MS;
      });
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [running, gameEnded, activeAgent, goal, grid, freeCells]);

  useEffect(() => {
    if (!running || gameEnded || !activeAgent) return;
    if (!targetCell || !costField) return;

    const hereCost = costField[activeAgent.pos.r][activeAgent.pos.c];
    const reachable = Number.isFinite(hereCost) && hereCost < 1e9;

    if (!reachable) {
      const fallback = bestFallbackCell(grid, activeAgent.pos, targetCell, costField);
      const nextGrid = cloneGrid(grid);
      nextGrid[fallback.r][fallback.c] = { letter: activeAgent.letter, locked: true };
      setGrid(nextGrid);
      setActiveAgent(null);
      setSettledCount((value) => value + 1);
      return;
    }

    if (activeAgent.pos.r === targetCell.r && activeAgent.pos.c === targetCell.c) {
      const nextGrid = cloneGrid(grid);
      nextGrid[targetCell.r][targetCell.c] = {
        letter: activeAgent.letter,
        locked: true,
      };
      setGrid(nextGrid);
      setActiveAgent(null);
      setSettledCount((value) => value + 1);
      return;
    }

    const step = nextStepToward(costField, activeAgent.pos);
    if (!step) {
      const nextGrid = cloneGrid(grid);
      nextGrid[activeAgent.pos.r][activeAgent.pos.c] = {
        letter: activeAgent.letter,
        locked: true,
      };
      setGrid(nextGrid);
      setActiveAgent(null);
      setSettledCount((value) => value + 1);
      return;
    }

    setActiveAgent((agent) => (agent ? { ...agent, pos: step } : agent));
  }, [activeAgent, running, gameEnded, grid, targetCell, costField]);

  const heat = useCallback(
    (r: number, c: number) => {
      if (!showCost || !costField) return undefined;
      const value = costField[r][c];
      if (!Number.isFinite(value) || value >= 1e9) return "rgba(15, 23, 42, 0.92)";
      const max = GRID_SIZE * 2;
      const t = Math.max(0, Math.min(1, value / max));
      const alpha = 0.15 + t * 0.45;
      return `rgba(59, 130, 246, ${alpha})`;
    },
    [showCost, costField],
  );

  return (
    <div className="app-shell">
      <div className="app-backdrop" />
      <div className="app-layout">
        <section className="main-column">
          <header className="hero panel">
            <p className="eyebrow">Netlify-ready Vite app</p>
            <h1>Flowfield Word Game</h1>
            <p className="hero-copy">
              Spawn letters from the board edge, steer the target cursor, and score
              words from the maze your agents build.
            </p>
          </header>

          <div className="control-row panel">
            <button
              type="button"
              onClick={() => setRunning((value) => !value)}
              className="action-button action-button--primary"
              disabled={gameEnded}
            >
              {running ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={endGame}
              className="action-button action-button--danger"
            >
              End Game
            </button>
            <button
              type="button"
              onClick={resetGame}
              className="action-button action-button--muted"
            >
              Reset
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showCost}
                onChange={(event) => setShowCost(event.target.checked)}
              />
              <span>Show flow cost</span>
            </label>
          </div>

          <section className="board-panel panel">
            <div
              className="board-grid"
              style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, var(--cell-size))` }}
            >
              {Array.from({ length: GRID_SIZE }).map((_, r) =>
                Array.from({ length: GRID_SIZE }).map((__, c) => {
                  const cell = grid[r][c];
                  const isGoal = goal.r === r && goal.c === c;
                  const isTarget = targetCell?.r === r && targetCell?.c === c;
                  const isAgent = activeAgent?.pos.r === r && activeAgent?.pos.c === c;
                  const lineOn = r === goal.r || c === goal.c;

                  return (
                    <button
                      type="button"
                      key={`${r}-${c}`}
                      onClick={() => setGoal({ r, c })}
                      className="board-cell"
                      style={{
                        background: isAgent
                          ? "#f59e0b"
                          : cell.locked
                            ? "#334155"
                            : isGoal
                              ? "#dc2626"
                              : lineOn
                                ? "rgba(239, 68, 68, 0.12)"
                                : heat(r, c) || "#e5e7eb",
                        color:
                          cell.locked || isAgent || isGoal ? "#ffffff" : "#0f172a",
                      }}
                      aria-label={`Cell ${r}, ${c}`}
                    >
                      {cell.letter ?? (isAgent ? activeAgent?.letter : "")}
                      {isGoal && !cell.letter && !isAgent ? (
                        <span className="goal-indicator" />
                      ) : null}
                      {isTarget && !isGoal ? (
                        <span className="target-indicator" />
                      ) : null}
                    </button>
                  );
                }),
              )}
            </div>
          </section>

          <section className="panel copy-panel">
            <p>
              Letters spawn from one of the four rays extending from the cursor to
              the board edge, then follow a shared goal-directed cost field. Settled
              letters become obstacles, so later letters route around them or lock
              onto the nearest available reachable cell.
            </p>
          </section>
        </section>

        <aside className="sidebar">
          <section className="panel">
            <h2>Game Status</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Score</span>
                <strong>{score}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Free cells</span>
                <strong>{freeCells}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Spawned</span>
                <strong>{spawnedCount}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Settled</span>
                <strong>{settledCount}</strong>
              </div>
            </div>
            <div className="meta-card">
              <div>
                <span className="meta-label">Cursor:</span> ({goal.r}, {goal.c})
              </div>
              <div>
                <span className="meta-label">Target cell:</span>{" "}
                {targetCell ? `(${targetCell.r}, ${targetCell.c})` : "none"}
              </div>
              <div>
                <span className="meta-label">Tick:</span> {tickCount}
              </div>
              <div>
                <span className="meta-label">Next spawn in:</span>{" "}
                {Math.max(0, spawnCountdown)} ms
              </div>
              <div>
                <span className="meta-label">Active letter:</span>{" "}
                {activeAgent ? `${activeAgent.letter} from ${activeAgent.spawnSide}` : "none"}
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Controls</h2>
            <ul className="detail-list">
              <li>Click any cell to move the cursor there.</li>
              <li>Use arrow keys to nudge the cursor.</li>
              <li>One letter spawns at a time from the top, right, bottom, or left ray.</li>
              <li>Locked letters become obstacles for future letters.</li>
              <li>End the game manually or fill the board.</li>
            </ul>
          </section>

          <section className="panel words-panel">
            <h2>Found Words {gameEnded ? "(final)" : "(shown after ending)"}</h2>
            {words.length === 0 ? (
              <p className="empty-state">No scored words yet.</p>
            ) : (
              <div className="word-list">
                {words
                  .slice()
                  .sort((a, b) => b.points - a.points || b.length - a.length)
                  .map((word, index) => (
                    <article key={`${word.word}-${index}`} className="word-card">
                      <strong>{word.word}</strong>
                      <span>
                        {word.direction} · start ({word.start.r}, {word.start.c}) ·{" "}
                        {word.points} pts
                      </span>
                    </article>
                  ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
