import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import { fixtureGame } from "./core";
import { getGame, getLastGame, saveGame } from "./db";
const memory=new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{value:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k),clear:()=>memory.clear()}});
beforeEach(()=>memory.clear());
it("persiste y restaura la última partida desde IndexedDB",async()=>{const game=fixtureGame();game.calledNumbers=[5];await saveGame(game);expect(await getGame(game.id)).toEqual(game);expect(await getLastGame()).toEqual(game)});
