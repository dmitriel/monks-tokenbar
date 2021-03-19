import { registerSettings } from "./settings.js";
import { TokenBar } from "./apps/tokenbar.js";
import { AssignXP, AssignXPApp } from "./apps/assignxp.js";
import { SavingThrow } from "./apps/savingthrow.js";
import { ContestedRoll } from "./apps/contestedroll.js";
import { LootablesApp } from "./apps/lootables.js";
import { MonksTokenBarAPI } from "./monks-tokenbar-api.js";

export let debug = (...args) => {
    if (debugEnabled > 1) console.log("DEBUG: monks-tokenbar-lite | ", ...args);
};
export let log = (...args) => console.log("monks-tokenbar-lite | ", ...args);
export let warn = (...args) => {
    if (debugEnabled > 0) console.warn("monks-tokenbar-lite | ", ...args);
};
export let error = (...args) => console.error("monks-tokenbar-lite | ", ...args);
export let i18n = key => {
    return game.i18n.localize(key);
};
export let setting = key => {
    return game.settings.get("monks-tokenbar-lite", key);
};

export class MonksTokenBar {
    static tracker = false;
    static tokenbar = null;

    static init() {
	    log("initializing");
        // element statics
        //CONFIG.debug.hooks = true;

        MonksTokenBar.SOCKET = "module.monks-tokenbar-lite";

        registerSettings();
    }

    static ready() {
        game.socket.on(MonksTokenBar.SOCKET, MonksTokenBar.onMessage);

        MonksTokenBar.requestoptions = [];
        if (["dnd5e", "sw5e"].includes(game.system.id)) {
            MonksTokenBar.requestoptions.push({ id: "init", text: i18n("MonksTokenBar.Initiative") });
            MonksTokenBar.requestoptions.push({ id: "death", text: i18n("MonksTokenBar.DeathSavingThrow") });
        }
        if (["pf2e"].includes(game.system.id)) {
            MonksTokenBar.requestoptions.push({ id: "attribute", text: "Attributes", groups: { "perception": CONFIG.PF2E.attributes.perception } });
        }
        let config;
		switch (game.system.id) {
			case "tormenta20":
				config = CONFIG.T20;
				break;
			default:
				config = CONFIG[game.system.id.toUpperCase()];
		}
		if(config){
			//Ability rolls
			if (config.abilities != undefined) {
				MonksTokenBar.requestoptions.push({ id: "ability", text: i18n("MonksTokenBar.Ability"), groups: config.abilities });
			}
			else if (config.atributos != undefined) {
				MonksTokenBar.requestoptions.push({ id: "ability", text: i18n("MonksTokenBar.Ability"), groups: config.atributos });
			}
			else if (config.scores != undefined) {
				MonksTokenBar.requestoptions.push({ id: "scores", text: i18n("MonksTokenBar.Ability"), groups: config.scores });
			}
			//Saving Throw
			if (config.saves != undefined) {
				MonksTokenBar.requestoptions.push({ id: "save", text: i18n("MonksTokenBar.SavingThrow"), groups: config.saves });
			}
			else if (config.savingThrows != undefined) {
				MonksTokenBar.requestoptions.push({ id: "save", text: i18n("MonksTokenBar.SavingThrow"), groups: config.savingThrows });
			}
			else if (config.resistencias != undefined) {
				MonksTokenBar.requestoptions.push({ id: "save", text: i18n("MonksTokenBar.SavingThrow"), groups: config.resistencias });
			}
			else if (config.saves_long != undefined) {
				MonksTokenBar.requestoptions.push({ id: "save", text: i18n("MonksTokenBar.SavingThrow"), groups: config.saves_long });
			}
            else if (["dnd5e", "sw5e"].includes(game.system.id)) {
				MonksTokenBar.requestoptions.push({ id: "save", text: i18n("MonksTokenBar.SavingThrow"), groups: config.abilities });
			}

			//Skills
			if (config.skills != undefined) {
				MonksTokenBar.requestoptions.push({ id: "skill", text: i18n("MonksTokenBar.Skill"), groups: config.skills });
			}
			else if (config.pericias != undefined) {
				MonksTokenBar.requestoptions.push({ id: "skill", text: i18n("MonksTokenBar.Skill"), groups: config.pericias });
			}
		}
        MonksTokenBar.requestoptions.push({
            id: "dice", text: "Dice", groups: { "1d2": "1d2", "1d4": "1d4", "1d6": "1d6", "1d8": "1d8", "1d10": "1d10", "1d12": "1d12", "1d20": "1d20", "1d100": "1d100" }
        });

        if ((game.user.isGM || setting("allow-player")) && !setting("disable-tokenbar")) {
            MonksTokenBar.tokenbar = new TokenBar();
            MonksTokenBar.tokenbar.refresh();
        }

        if (game.user.isGM && setting('assign-loot') && game.modules.get("lootsheetnpc5e")?.active) {
            let npcObject = (CONFIG.Actor.sheetClasses.npc || CONFIG.Actor.sheetClasses.minion);
            if (npcObject != undefined) {
                let npcSheetNames = Object.values(npcObject)
                    .map((sheetClass) => sheetClass.cls)
                    .map((sheet) => sheet.name);

                npcSheetNames.forEach((sheetName) => {
                    Hooks.on("render" + sheetName, (app, html, data) => {
                        // only for GMs or the owner of this npc
                        if (app?.token?.actor?.getFlag('monks-tokenbar-lite', 'converted') && app.element.find(".revert-lootable").length == 0) {
                            const link = $('<a class="revert-lootable"><i class="fas fa-backward"></i>Revert Lootable</a>');
                            link.on("click", () => LootablesApp.revertLootable(app));
                            app.element.find(".window-title").after(link);
                        }
                    });
                });
            }
        }
    }

    static onMessage(data) {
        switch (data.msgtype) {
            case 'rollability': {
                if (game.user.isGM) {
                    let message = game.messages.get(data.msgid);
                    const revealDice = game.dice3d ? game.settings.get("dice-so-nice", "immediatelyDisplayChatMessages") : true;
                    for (let response of data.response) {
                        let r = Roll.fromData(response.roll);
                        response.roll = r;
                    }
                    if (data.type == 'savingthrow')
                        SavingThrow.updateMessage(data.response, message, revealDice);
                    else if (data.type == 'contestedroll')
                        ContestedRoll.updateContestedRoll(data.response, message, revealDice);
                }
            } break;
            case 'finishroll': {
                if (game.user.isGM) {
                    let message = game.messages.get(data.msgid);
                    if (data.type == 'savingthrow')
                        SavingThrow.finishRolling(data.response, message);
                    else if (data.type == 'contestedroll')
                        ContestedRoll.finishRolling(data.actorid, message);
                }
            } break;
            case 'assignxp': {
                let message = game.messages.get(data.msgid);
                AssignXP.onAssignXP(data.actorid, message);
            } break;
        }
    }

    static getDiceSound(hasMaestroSound = false) {
        const has3DDiceSound = game.dice3d ? game.settings.get("dice-so-nice", "settings").enabled : false;
        const playRollSounds = true; //game.settings.get("betterrolls5e", "playRollSounds")

        if (playRollSounds && !has3DDiceSound && !hasMaestroSound) {
            return CONFIG.sounds.dice;
        }

        return null;
    }

    static async onDeleteCombat(combat) {
        if (game.user.isGM) {
            if (combat.started == true) {
                let axpa;
                if (game.settings.get("monks-tokenbar-lite", "show-xp-dialog") && (!["dnd5e", "sw5e"].includes(game.world.system) || !game.settings.get(game.world.system, 'disableExperienceTracking'))) {
                    axpa = new AssignXPApp(combat);
                    await axpa.render(true);
                }
                /*
                if (game.settings.get("monks-tokenbar-lite", "show-xp-dialog") && (game.world.system !== "sw5e" || (game.world.system === "sw5e" && !game.settings.get('sw5e', 'disableExperienceTracking')))) {
                    axpa = new AssignXPApp(combat);
                    await axpa.render(true);
                }*/

                if (setting("assign-loot") && game.modules.get("lootsheetnpc5e")?.active) {
                    let lapp = new LootablesApp(combat);
                    await lapp.render(true);

                    if (axpa != undefined) {
                        setTimeout(function () {
                            axpa.position.left += 204;
                            axpa.render();
                            lapp.position.left -= 204;
                            lapp.render();
                        }, 100);
                    }
                }
            }
        }
    }

    static getRequestName(requestoptions, requesttype, request) {
        let name = '';
        switch (requesttype) {
            case 'ability': name = i18n("MonksTokenBar.AbilityCheck"); break;
            case 'save': name = i18n("MonksTokenBar.SavingThrow"); break;
            case 'dice': name = i18n("MonksTokenBar.Roll"); break;
            default:
                name = (request != 'death' && request != 'init' ? i18n("MonksTokenBar.Check") : "");
        }
        let rt = requestoptions.find(o => {
            return o.id == (requesttype || request);
        });
        let req = (rt?.groups && rt?.groups[request]);
        let flavor = req || rt?.text;
        switch (game.i18n.lang) {
            case "pt-BR":
            case "es":
                name = name + ": " + flavor;
                break;
            case "en":
            default:
                name = flavor + " " + name;
        }
        return name;
    }

    static setGrabMessage(message, event) {
        if (MonksTokenBar.grabmessage != undefined) {
            $('#chat-log .chat-message[data-message-id="' + MonksTokenBar.grabmessage.id + '"]').removeClass('grabbing');
        }

        if (MonksTokenBar.grabmessage == message)
            MonksTokenBar.grabmessage = null;
        else {
            MonksTokenBar.grabmessage = message;
            if(message != undefined)
                $('#chat-log .chat-message[data-message-id="' + MonksTokenBar.grabmessage.id + '"]').addClass('grabbing');
        }

        if (event.stopPropagation) event.stopPropagation();
        if (event.preventDefault) event.preventDefault();
        event.cancelBubble = true;
        event.returnValue = false;
    }

    static onClickMessage(message, html) {
        if (MonksTokenBar.grabmessage != undefined) {
            //make sure this message matches the grab message
            let roll = {};
            if (game.system.id == 'pf2e') {
                let [abilityId, type] = message.data.flags.pf2e.context.type.split('-');
                roll = { type: (type == 'check' ? 'attribute': type), abilityId: abilityId };
            } else
                roll = message.getFlag(game.system.id, 'roll');
            if (roll && MonksTokenBar.grabmessage.getFlag('monks-tokenbar-lite', 'requesttype') == roll.type &&
                MonksTokenBar.grabmessage.getFlag('monks-tokenbar-lite', 'request') == (roll.skillId || roll.abilityId)) {
                let tokenId = message.data.speaker.token;
                let msgtoken = MonksTokenBar.grabmessage.getFlag('monks-tokenbar-lite', 'token' + tokenId);

                if (msgtoken != undefined) {
                    let r = Roll.fromJSON(message.data.roll);
                    SavingThrow.updateMessage([{ id: tokenId, roll: r }], MonksTokenBar.grabmessage);
                    if (setting('delete-after-grab'))
                        message.delete();
                    MonksTokenBar.grabmessage = null;
                }
            }
        }
    }
}

Hooks.once('init', async function () {
    log('Initializing Combat Details');
    // Assign custom classes and constants here
    // Register custom module settings
    MonksTokenBar.init();
    MonksTokenBarAPI.init();

    //$('body').on('click', $.proxy(MonksTokenBar.setGrabMessage, MonksTokenBar, null));
});

Hooks.on("deleteCombat", MonksTokenBar.onDeleteCombat);

Hooks.on("updateCombat", function (combat, delta) {
    if (game.user.isGM) {
        if (MonksTokenBar.tokenbar) {
            $(MonksTokenBar.tokenbar.tokens).each(function () {
                this.token.unsetFlag("monks-tokenbar-lite", "nofified");
            });
        }
    }
});

Hooks.on("ready", MonksTokenBar.ready);

Hooks.on("getSceneControlButtons", (controls) => {
    if (game.user.isGM && setting('show-lootable-menu') && game.modules.get("lootsheetnpc5e")?.active) {
        let tokenControls = controls.find(control => control.name === "token")
        tokenControls.tools.push({
            name: "togglelootable",
            title: "MonksTokenBar.Lootables",
            icon: "fas fa-dolly-flatbed",
            onClick: () => {
                new LootablesApp().render(true);
            },
            toggle: false,
            button: true
        });
    }
});
