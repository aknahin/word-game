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
};

type FoundWord = {
  word: string;
  start: Pos;
  direction: "horizontal" | "vertical";
  length: number;
};

const GRID_SIZE = 30;
const SPAWN_DELAY_MS = 3000;
const DEFAULT_MOVE_SPEED_MS = 600;
const MIN_MOVE_SPEED_MS = 400;
const MAX_MOVE_SPEED_MS = 5000;
const COUNTDOWN_INTERVAL_MS = 100;
const ALPHABET =
  "EEEEEEEEEEEEAAAAAAAARRRRRRIIIIIIOOOOOTTNNNSSSLLLCCDDUUMMBBFFGGHHPPVVWWYYKJXQZ";

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

function getSpawnPoint(
  goal: Pos,
  grid: Cell[][],
): { pos: Pos; side: Agent["spawnSide"] } | null {
  const candidates: Array<{ pos: Pos; side: Agent["spawnSide"] }> = [
    { pos: { r: 0, c: goal.c }, side: "top" },
    { pos: { r: goal.r, c: GRID_SIZE - 1 }, side: "right" },
    { pos: { r: GRID_SIZE - 1, c: goal.c }, side: "bottom" },
    { pos: { r: goal.r, c: 0 }, side: "left" },
  ];

  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return candidates.find(({ pos }) => !grid[pos.r][pos.c].locked) ?? null;
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

function findWords(grid: Cell[][], dictionary: Set<string>): FoundWord[] {
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
            if (!dictionary.has(word)) continue;
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
  const [activeAgents, setActiveAgents] = useState<Agent[]>([]);
  const [running, setRunning] = useState(true);
  const [gameEnded, setGameEnded] = useState(false);
  const [spawnCountdown, setSpawnCountdown] = useState(SPAWN_DELAY_MS);
  const [moveSpeedMs, setMoveSpeedMs] = useState(DEFAULT_MOVE_SPEED_MS);
  const [score, setScore] = useState(0);
  const [words, setWords] = useState<FoundWord[]>([]);
  const [dictionary, setDictionary] = useState<Set<string> | null>(null);
  const [dictionaryError, setDictionaryError] = useState<string | null>(null);
  const [wordDescriptions, setWordDescriptions] = useState<Record<string, string>>({});
  const [descriptionStatus, setDescriptionStatus] = useState<"idle" | "loading" | "ready">(
    "idle",
  );
  const [spawnCycle, setSpawnCycle] = useState(0);
  const [spawnedCount, setSpawnedCount] = useState(0);
  const [settledCount, setSettledCount] = useState(0);
  const nextAgentId = useRef(1);
  const gridRef = useRef(grid);
  const goalRef = useRef(goal);
  const activeAgentsRef = useRef(activeAgents);

  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  useEffect(() => {
    goalRef.current = goal;
  }, [goal]);

  useEffect(() => {
    activeAgentsRef.current = activeAgents;
  }, [activeAgents]);

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
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDictionary() {
      try {
        const response = await fetch("/word-directory.txt");
        if (!response.ok) {
          throw new Error(`Dictionary request failed with ${response.status}`);
        }

        const text = await response.text();
        if (cancelled) return;

        const loadedWords = text
          .split("\n")
          .map((word) => word.trim())
          .filter(Boolean);

        setDictionary(new Set(loadedWords));
        setDictionaryError(null);
      } catch (error) {
        if (cancelled) return;
        setDictionaryError(
          error instanceof Error ? error.message : "Unable to load word directory.",
        );
      }
    }

    void loadDictionary();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!gameEnded || !dictionary) return;
    const found = findWords(grid, dictionary);
    setWords(found);
    setScore(found.length);
  }, [dictionary, gameEnded, grid]);

  useEffect(() => {
    if (!gameEnded || words.length === 0) {
      setWordDescriptions({});
      setDescriptionStatus("idle");
      return;
    }

    let cancelled = false;
    const uniqueWords = Array.from(new Set(words.map((word) => word.word)));
    setDescriptionStatus("loading");

    async function loadDescriptions() {
      const entries = await Promise.all(
        uniqueWords.map(async (word) => {
          try {
            const response = await fetch(
              `https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`,
            );
            if (!response.ok) {
              return [word, "Description unavailable."] as const;
            }

            const payload = (await response.json()) as Array<{
              meanings?: Array<{ definitions?: Array<{ definition?: string }> }>;
            }>;

            const definition = payload
              .flatMap((entry) => entry.meanings ?? [])
              .flatMap((meaning) => meaning.definitions ?? [])
              .map((item) => item.definition?.trim())
              .find(Boolean);

            return [word, definition ?? "Description unavailable."] as const;
          } catch {
            return [word, "Description unavailable."] as const;
          }
        }),
      );

      if (cancelled) return;
      setWordDescriptions(Object.fromEntries(entries));
      setDescriptionStatus("ready");
    }

    void loadDescriptions();

    return () => {
      cancelled = true;
    };
  }, [gameEnded, words]);

  const resetGame = useCallback(() => {
    setGrid(makeEmptyGrid());
    setGoal({ r: 14, c: 14 });
    setActiveAgents([]);
    setRunning(true);
    setGameEnded(false);
    setSpawnCountdown(SPAWN_DELAY_MS);
    setMoveSpeedMs(DEFAULT_MOVE_SPEED_MS);
    setScore(0);
    setWords([]);
    setWordDescriptions({});
    setDescriptionStatus("idle");
    setSpawnCycle(0);
    setSpawnedCount(0);
    setSettledCount(0);
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
    if (!running || gameEnded || freeCells === 0) return;

    setSpawnCountdown(SPAWN_DELAY_MS);

    const countdownTimer = window.setInterval(() => {
      setSpawnCountdown((prev) => Math.max(0, prev - COUNTDOWN_INTERVAL_MS));
    }, COUNTDOWN_INTERVAL_MS);

    const spawnTimer = window.setTimeout(() => {
      const latestGrid = gridRef.current;
      const latestGoal = goalRef.current;
      const occupied = new Set(
        activeAgentsRef.current.map((agent) => keyOf(agent.pos)),
      );
      const spawnPoint = getSpawnPoint(latestGoal, latestGrid);
      if (!spawnPoint) {
        setSpawnCountdown(SPAWN_DELAY_MS);
        setSpawnCycle((value) => value + 1);
        return;
      }

      const { pos, side } = spawnPoint;
      if (occupied.has(keyOf(pos))) {
        setSpawnCountdown(SPAWN_DELAY_MS);
        setSpawnCycle((value) => value + 1);
        return;
      }

      setActiveAgents((current) => [
        ...current,
        {
          id: nextAgentId.current,
          letter: randomLetter(),
          pos,
          spawnSide: side,
        },
      ]);
      nextAgentId.current += 1;
      setSpawnedCount((value) => value + 1);
      setSpawnCountdown(SPAWN_DELAY_MS);
      setSpawnCycle((value) => value + 1);
    }, SPAWN_DELAY_MS);

    return () => {
      window.clearInterval(countdownTimer);
      window.clearTimeout(spawnTimer);
    };
  }, [running, gameEnded, freeCells, spawnCycle]);

  useEffect(() => {
    if (!running || gameEnded || activeAgents.length === 0) return;
    if (!targetCell || !costField) return;

    const moveTimer = window.setTimeout(() => {
      const nextGrid = cloneGrid(grid);
      const settledAgents: Agent[] = [];
      const occupiedNext = new Set<string>();

      const remainingAgents = activeAgents
        .slice()
        .sort((a, b) => a.id - b.id)
        .flatMap((agent) => {
          const hereCost = costField[agent.pos.r][agent.pos.c];
          const reachable = Number.isFinite(hereCost) && hereCost < 1e9;

          if (!reachable) {
            const fallback = bestFallbackCell(nextGrid, agent.pos, targetCell, costField);
            nextGrid[fallback.r][fallback.c] = { letter: agent.letter, locked: true };
            settledAgents.push(agent);
            return [];
          }

          if (agent.pos.r === targetCell.r && agent.pos.c === targetCell.c) {
            nextGrid[targetCell.r][targetCell.c] = {
              letter: agent.letter,
              locked: true,
            };
            settledAgents.push(agent);
            return [];
          }

          const step = nextStepToward(costField, agent.pos);
          if (!step) {
            nextGrid[agent.pos.r][agent.pos.c] = {
              letter: agent.letter,
              locked: true,
            };
            settledAgents.push(agent);
            return [];
          }

          const nextKey = keyOf(step);
          if (occupiedNext.has(nextKey) || nextGrid[step.r][step.c].locked) {
            occupiedNext.add(keyOf(agent.pos));
            return [agent];
          }

          occupiedNext.add(nextKey);
          return [{ ...agent, pos: step }];
        });

      if (settledAgents.length > 0) {
        setGrid(nextGrid);
        setSettledCount((value) => value + settledAgents.length);
      }

      setActiveAgents(remainingAgents);
    }, moveSpeedMs);

    return () => window.clearTimeout(moveTimer);
  }, [activeAgents, running, gameEnded, grid, targetCell, costField, moveSpeedMs]);

  return (
    <div className="app-shell">
      <div className="app-backdrop" />
      <div className="app-layout">
        <section className="main-column">
          <header className="hero panel">
            <p className="eyebrow">Netlify-ready Vite app</p>
            <h1>Word Grid Game</h1>
            <p className="hero-copy">
              Drop letters onto the board, steer the target cursor, and score every
              valid word hidden inside each completed row or column.
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
            <label className="speed-control">
              <span>Letter speed</span>
              <input
                type="range"
                min={MIN_MOVE_SPEED_MS}
                max={MAX_MOVE_SPEED_MS}
                step={100}
                value={moveSpeedMs}
                onChange={(event) => setMoveSpeedMs(Number(event.target.value))}
              />
              <strong>{(moveSpeedMs / 1000).toFixed(1)}s per block</strong>
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
                  const agentHere = activeAgents.find(
                    (agent) => agent.pos.r === r && agent.pos.c === c,
                  );
                  const isGoal = goal.r === r && goal.c === c;
                  const isTarget = targetCell?.r === r && targetCell?.c === c;
                  const lineOn = r === goal.r || c === goal.c;

                  return (
                    <button
                      type="button"
                      key={`${r}-${c}`}
                      onClick={() => setGoal({ r, c })}
                      className="board-cell"
                      style={{
                        background: agentHere
                          ? "#f59e0b"
                          : cell.locked
                            ? "#334155"
                            : isGoal
                              ? "#dc2626"
                              : lineOn
                                ? "rgba(239, 68, 68, 0.12)"
                                : "#e5e7eb",
                        color:
                          cell.locked || agentHere || isGoal ? "#ffffff" : "#0f172a",
                      }}
                      aria-label={`Cell ${r}, ${c}`}
                    >
                      {cell.letter ?? agentHere?.letter ?? ""}
                      {isGoal && !cell.letter && !agentHere ? (
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
              A new letter enters every 3 seconds and every live letter keeps moving
              toward your cursor on its own timer. Settled letters become obstacles,
              so later letters must route around them or lock onto the nearest
              reachable cell.
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
                <span className="meta-label">Next spawn in:</span>{" "}
                {(Math.max(0, spawnCountdown) / 1000).toFixed(1)} s
              </div>
              <div>
                <span className="meta-label">Active letter:</span>{" "}
                {activeAgents.length === 0 ? "none" : `${activeAgents.length} moving`}
              </div>
              <div>
                <span className="meta-label">Scoring:</span>{" "}
                {dictionaryError
                  ? "word directory unavailable"
                  : dictionary
                    ? "1 point per valid word"
                    : "loading word directory"}
              </div>
              <div>
                <span className="meta-label">Letter set:</span> all 26 English letters,
                weighted by frequency
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Controls</h2>
            <ul className="detail-list">
              <li>Click any cell to move the cursor there.</li>
              <li>Use arrow keys to nudge the cursor.</li>
              <li>Use the speed slider to set how long each letter takes per block.</li>
              <li>A new letter enters every 3 seconds from the top, right, bottom, or left edge.</li>
              <li>Locked letters become obstacles for future letters.</li>
              <li>End the game manually or fill the board.</li>
            </ul>
          </section>

          <section className="panel words-panel">
            <h2>Found Words {gameEnded ? "(final)" : "(shown after ending)"}</h2>
            {gameEnded && words.length > 0 && descriptionStatus === "loading" ? (
              <p className="empty-state">Loading word descriptions...</p>
            ) : null}
            {words.length === 0 ? (
              <p className="empty-state">
                {dictionaryError
                  ? "Word directory failed to load."
                  : gameEnded && dictionary
                    ? "No valid words found."
                    : "Finish a round to see scored words."}
              </p>
            ) : (
              <div className="word-list">
                {words
                  .slice()
                  .sort((a, b) => b.length - a.length || a.word.localeCompare(b.word))
                  .map((word, index) => (
                    <article key={`${word.word}-${index}`} className="word-card">
                      <strong>{word.word}</strong>
                      <span>
                        {word.direction} · start ({word.start.r}, {word.start.c}) · 1 point
                      </span>
                      <p>{wordDescriptions[word.word] ?? "Description unavailable."}</p>
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
