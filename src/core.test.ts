import { describe, expect, it } from "vitest";
import { cardIssues, completedRows, finishModality, fixtureGame, isFullCard, modalityComplete, modalityRemaining, normalizeParsedCard, resetMarks, setModality, table197Game, table214Game, toggleNumber, undoLast } from "./core";
import { extractCardsFromText } from "./ocr";
import { deserializeGame, serializeGame } from "./db";

describe("reglas de Bingo",()=>{
 it("valida los rangos B-I-N-G-O",()=>{const game=fixtureGame();expect(cardIssues(game.cards[0].rows)).toEqual([]);const rows=game.cards[0].rows.map(r=>[...r]);rows[0][0]=67;expect(cardIssues(rows)).toContain("B1")});
 it("normaliza OCR y reduce confianza ante valores sospechosos",()=>{const card=fixtureGame().cards[0];const normalized=normalizeParsedCard({id:"ocr",rows:card.rows.map(r=>[...r]),confidence:.9});expect(normalized.confidence).toBe(.9);normalized.rows[0][0]=67;expect(cardIssues(normalized.rows)).toHaveLength(1)});
 it("ignora números decorativos y encuentra un cartón por reglas de columnas",()=>{const text="BINGO BUENA SUERTE 75 TABLA 214 10 21 45 60 69 12 18 40 49 74 13 27 58 61 14 28 35 53 71 3 30 36 46 63";const cards=extractCardsFromText(text);expect(cards).toHaveLength(1);expect(cards[0].rows[0]).toEqual([10,21,45,60,69]);expect(cards[0].rows[2]).toEqual([13,27,null,58,61])});
});
describe("estado global",()=>{
 it("incluye completos los cuatro cartones de la Tabla 197",()=>{const game=table197Game();expect(game.cards).toHaveLength(4);expect(game.cards.every(card=>cardIssues(card.rows).length===0)).toBe(true);expect(game.cards[0].rows[0]).toEqual([6,23,34,59,70]);expect(game.cards[3].rows[4]).toEqual([11,25,45,54,75])});
 it("incluye completos los cuatro cartones de la Tabla 214",()=>{const game=table214Game();expect(game.cards).toHaveLength(4);expect(game.cards.every(card=>cardIssues(card.rows).length===0)).toBe(true);expect(game.cards[0].rows[0]).toEqual([10,21,45,60,69]);expect(game.cards[3].rows[4]).toEqual([8,19,36,58,67])});
 it("marca y desmarca todas las ocurrencias del 5",()=>{let game=toggleNumber(fixtureGame(),5);expect(game.calledNumbers).toEqual([5]);expect(game.cards.filter(c=>c.rows.flat().includes(5))).toHaveLength(3);game=toggleNumber(game,5);expect(game.calledNumbers).toEqual([])});
 it("deshace el último número",()=>{let game=toggleNumber(toggleNumber(fixtureGame(),5),14);game=undoLast(game);expect(game.calledNumbers).toEqual([5]);expect(game.history).toEqual([5])});
 it("reinicia marcas conservando cartones",()=>{const game=resetMarks(toggleNumber(fixtureGame(),5));expect(game.calledNumbers).toEqual([]);expect(game.cards).toHaveLength(4)});
 it("detecta línea y cartón completo",()=>{const game=fixtureGame(),card=game.cards[0];const row=card.rows[0].filter((n):n is number=>n!==null);expect(completedRows(card,row)).toBe(1);const all=card.rows.flat().filter((n):n is number=>n!==null);expect(isFullCard(card,all)).toBe(true)});
 it("serializa una partida versionada",()=>{const game=toggleNumber(fixtureGame(),5);expect(deserializeGame(serializeGame(game))).toEqual(game)});
 it("calcula una modalidad libre y permite finalizarla",()=>{const card=table214Game().cards[0];const cells=[0,1,2,3,4,12];const called=[10,21,45,60];expect(modalityRemaining(card,called,cells)).toBe(1);expect(modalityComplete(card,[...called,69],cells)).toBe(true);let game=setModality(table214Game(),"Flecha",cells);expect(game.modality?.status).toBe("active");game=finishModality(game);expect(game.modality?.status).toBe("completed")});
});
