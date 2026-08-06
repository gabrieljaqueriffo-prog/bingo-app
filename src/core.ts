import type { Card, Cell, Game, ParsedCard } from "./types";

export const COLUMN_RANGES = [[1,15],[16,30],[31,45],[46,60],[61,75]] as const;
export const emptyRows = (): Cell[][] => Array.from({length: 5}, (_, r) => Array.from({length: 5}, (_, c) => r === 2 && c === 2 ? null : 0));
export function isValidCell(value: Cell, col: number, row: number) { if (row === 2 && col === 2) return value === null; return typeof value === "number" && value >= COLUMN_RANGES[col][0] && value <= COLUMN_RANGES[col][1]; }
export function cardIssues(rows: Cell[][]) { const out: string[] = []; rows.forEach((row,r) => row.forEach((v,c) => { if (!isValidCell(v,c,r)) out.push(`${"BINGO"[c]}${r+1}`); })); return out; }
export function toggleNumber(game: Game, number: number): Game { const active = game.calledNumbers.includes(number); return {...game, calledNumbers: active ? game.calledNumbers.filter(n => n !== number) : [...game.calledNumbers, number], history: active ? game.history.filter(n => n !== number) : [...game.history, number], updatedAt: new Date().toISOString()}; }
export function undoLast(game: Game): Game { const last = game.history.at(-1); return last == null ? game : {...game, calledNumbers: game.calledNumbers.filter(n => n !== last), history: game.history.slice(0,-1), updatedAt: new Date().toISOString()}; }
export function resetMarks(game: Game): Game { return {...game, calledNumbers: [], history: [], updatedAt: new Date().toISOString()}; }
export function markedCount(card: Card, called: number[]) { const set = new Set(called); return card.rows.flat().filter(v => v === null || set.has(v)).length - 1; }
export function completedRows(card: Card, called: number[]) { const set = new Set(called); return card.rows.filter(row => row.every(v => v === null || set.has(v))).length; }
export function nearestLine(card: Card, called: number[]) { const set = new Set(called); return Math.min(...card.rows.map(row => row.filter(v => v !== null && !set.has(v)).length)); }
export function isFullCard(card: Card, called: number[]) { const set = new Set(called); return card.rows.flat().every(v => v === null || set.has(v)); }
export function normalizeParsedCard(card: ParsedCard): ParsedCard { const rows = Array.from({length:5}, (_,r) => Array.from({length:5},(_,c) => r===2&&c===2 ? null : Number(card.rows?.[r]?.[c]) || 0)); const issues = cardIssues(rows); return {...card, rows, confidence: Math.max(0, Math.min(card.confidence, 1 - issues.length / 24))}; }

const rawFixture = [
[[10,21,45,60,69],[12,18,40,49,74],[13,27,null,58,61],[14,28,35,53,71],[3,30,36,46,63]],
[[8,16,43,56,62],[5,27,40,49,71],[3,28,null,53,75],[2,20,33,47,69],[14,21,35,58,61]],
[[9,27,34,51,70],[14,25,44,54,67],[11,21,null,52,66],[10,28,41,53,61],[5,17,35,55,71]],
[[5,23,41,59,73],[14,17,37,56,71],[15,28,null,50,74],[3,24,42,52,64],[8,19,36,58,67]]
] as Cell[][][];
export function fixtureGame(): Game { const id = crypto.randomUUID(); const now = new Date().toISOString(); return {id,name:"Tabla 214",createdAt:now,updatedAt:now,status:"active",calledNumbers:[],history:[],cards:rawFixture.map((rows,i)=>({id:crypto.randomUUID(),gameId:id,label:`Cartón ${i+1}`,rows}))}; }
export function createGame(name="Nueva partida"): Game { const id=crypto.randomUUID(), now=new Date().toISOString(); return {id,name,createdAt:now,updatedAt:now,status:"active",calledNumbers:[],history:[],cards:[]}; }
