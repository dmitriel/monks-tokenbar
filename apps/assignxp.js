import { MonksTokenBar, log, i18n, setting } from "../monks-tokenbar.js";

export class AssignXPApp extends Application {
    constructor(entity, options = {}) {
        super(options);

        this.xp = options?.xp || 0;
        this.reason = options?.reason;
        this.dividexp = options?.dividexp || setting("divide-xp");

        if (game.world.system == 'pf2e')
            this.xpchart = [10, 15, 20, 30, 40, 60, 80, 120, 160];

        if (entity != undefined && entity instanceof Combat) {
            this.actors = [];
            var apl = { count: 0, levels: 0 };

            //get the actors
            for (let combatant of entity.combatants) {
                if (combatant.token?.disposition == 1 && combatant.actor) {
                    this.actors.push({
                        actor: combatant.actor,
                        disabled: false,
                        xp: 0
                    });

                    apl.count = apl.count + 1;
                    apl.levels = apl.levels + (combatant.actor.data.data.details.level.value || combatant.actor.data.data.details.level);
                }
            };
            var calcAPL = 0;
            if (apl.count > 0)
                calcAPL = Math.round(apl.levels / apl.count) + (apl.count < 4 ? -1 : (apl.count > 5 ? 1 : 0));

            //get the monster xp
            let combatxp = 0;
            for (let combatant of entity.combatants) {
                if (combatant.token?.disposition != 1) {
                    if (game.world.system == 'pf2e') {
                        let monstLevel = parseInt(combatant?.actor.data.data.details?.level?.value);
                        let monstXP = this.xpchart[Math.clamped(4 + (monstLevel - calcAPL), 0, this.xpchart.length - 1)];
                        combatxp += monstXP;
                    }else
                        combatxp += combatant.actor?.data.data.details?.xp?.value;
                }
            };
            //xp += (combatant?.actor.data.data.details?.xp?.value || MonksLittleDetails.xpchart[Math.clamped(parseInt(combatant?.actor.data.data.details?.level?.value), 0, MonksLittleDetails.xpchart.length - 1)] || 0);
            this.xp = this.xp || combatxp;
            this.reason = this.reason || i18n("MonksTokenBar.CombatExperience");
        } else {
            if (entity != undefined && !$.isArray(entity))
                entity = [entity];
            this.actors = (entity || (canvas.tokens.controlled.length > 0 ? canvas.tokens.controlled : canvas.tokens.placeables).filter(t => {
                return t.actor?.hasPlayerOwner && t.actor?.data.type == 'character'
            })).map(t => {
                return {
                    actor: t.actor,
                    disabled: false,
                    xp: 0
                };
            });
        }

        this.changeXP();
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "assignexperience",
            title: i18n("MonksTokenBar.AssignXP"),
            template: "./modules/monks-tokenbar-lite/templates/assignxp.html",
            width: 400,
            height: 400,
            popOut: true
        });
    }

    getData(options) {
        return {
            actors: this.actors,
            xp: this.xp,
            dividexp: this.dividexp,
            reason: this.reason
        };
    }

    changeXP(xp) {
        if(xp != undefined)
            this.xp = xp;

        let charxp = (this.dividexp ? parseInt(this.xp / this.actors.filter(a => { return !a.disabled; }).length) : this.xp);

        $(this.actors).each(function(){
            this.xp = (this.disabled ? 0 : charxp);
        });
    }

    addActor() {
        //drag drop?
        this.changeXP();
        this.render(true);
    }

    disableActor(id) {
        let actor = this.actors.find(a => { return a.actor.id === id; });
        if (actor != undefined)
            actor.disabled = !actor.disabled;
        this.changeXP();
        this.render(true);
    }

    async assign() {
        let chatactors = this.actors
            .filter(a => { return !a.disabled; })
            .map(a => {
                return {
                    id: a.actor.id,
                    //actor: a.actor,
                    icon: a.actor.data.img,
                    name: a.actor.data.name,
                    xp: a.xp,
                    assigned: false
                }
            });

        if (chatactors.length > 0) {
            let requestdata = {
                xp: this.xp,
                reason: $('#assign-xp-reason', this.element).val(), 
                actors: chatactors
            };
            const html = await renderTemplate("./modules/monks-tokenbar-lite/templates/assignxpchatmsg.html", requestdata);

            log('create chat request');
            let chatData = {
                user: game.user._id,
                content: html
            };
            
            setProperty(chatData, "flags.monks-tokenbar-lite", requestdata);
            ChatMessage.create(chatData, {});
            this.close();
        } else
            ui.notifications.warn(i18n("MonksTokenBar.RequestNoneActorSelected"));
    }

    activateListeners(html) {
        super.activateListeners(html);
        var that = this;

        //$('.item-create', html).click($.proxy(this.addToken, this));

        $('.item-list .item', html).each(function (elem) {
            $('.item-delete', this).click($.proxy(that.disableActor, that, this.dataset.itemId));
        });

        $('.dialog-buttons.assign', html).click($.proxy(this.assign, this));

        $('#divide-xp', html).click(function () {
            that.dividexp = $(this).is(':checked');
            that.changeXP.call(that);
            that.render(true);
        });

        $('#assign-xp-value', html).blur(function () {
            that.xp = parseInt($(this).val());
            that.changeXP.call(that, that.xp);
            that.render(true);
        });
    };
}

export class AssignXP {
    static async onAssignXP(actorid, message, e) {
        if (game.user.isGM) {
            let actors = JSON.parse(JSON.stringify(message.getFlag('monks-tokenbar-lite', 'actors')));
            let msgactor = actors.find(a => { return a.id == actorid; });

            if (!msgactor.assigned) {
                let actor = game.actors.get(actorid);
                await actor.update({
                    "data.details.xp.value": actor.data.data.details.xp.value + msgactor.xp
                });

                msgactor.assigned = true;
            }
            await message.setFlag('monks-tokenbar-lite', 'actors', actors);
        } else {
            $(e.target).hide();
            game.socket.emit(
                MonksTokenBar.SOCKET,
                {
                    msgtype: 'assignxp',
                    senderId: game.user._id,
                    actorid: actorid,
                    msgid: message.id
                },
                (resp) => { }
            );
        }
    }

    static async onAssignAllXP(message) {
        if (game.user.isGM) {
            let actors = message.getFlag('monks-tokenbar-lite', 'actors');
            for (let i = 0; i < actors.length; i++) {
                let msgactor = actors[i];
                if (!msgactor.assigned) {
                    await AssignXP.onAssignXP(msgactor.id, message);
                }
            };
        }
    }
}

Hooks.on("renderChatMessage", (message, html, data) => {
    const assignCard = html.find(".monks-tokenbar-lite.assignxp");
    if (assignCard.length !== 0) {
        if (!game.user.isGM)
            html.find(".gm-only").remove();
        if (game.user.isGM)
            html.find(".player-only").remove();

        $('.assign-all', html).click($.proxy(AssignXP.onAssignAllXP, AssignXP, message));

        let actors = message.getFlag('monks-tokenbar-lite', 'actors');

        let items = $('.item', html);
        for (let i = 0; i < items.length; i++) {
            var item = items[i];
            let actorId = $(item).attr('data-item-id');
            let actorData = actors.find(a => { return a.id == actorId; });
            let actor = game.actors.get(actorId);

            let assign = !actorData.assigned && (game.user.isGM || actor.owner);
            $('.add-xp', item).toggle(assign).click($.proxy(AssignXP.onAssignXP, this, actorId, message));
        }
    }
});
