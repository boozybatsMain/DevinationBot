import { Composer } from "grammy";
import type { MyContext } from "../types/index.js";
import { handleStart } from "./start.js";
import { handleHelp } from "./help.js";

export const commandsComposer = new Composer<MyContext>();

commandsComposer.command("start", handleStart);
commandsComposer.command("help", handleHelp);
