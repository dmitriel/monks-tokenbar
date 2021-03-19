import { MonksTokenBar, log, error, i18n, setting, MTB_MOVEMENT_TYPE } from "../monks-tokenbar.js";
import { SavingThrowApp } from "../apps/savingthrow.js";
import { ContestedRollApp } from "../apps/contestedroll.js";
import { AssignXPApp } from "../apps/assignxp.js";

export class TokenBar extends Application {
	constructor(options) {
	    super(options);

        this.tokens = [];

        /**
            * Track collapsed state
            * @type {boolean}
            */
        this._collapsed = false;

        /**
            * Track which hotbar slot is the current hover target, if any
            * @type {number|null}
            */
        this._hover = null;

        Hooks.on('canvasReady', () => {
            this.refresh();
        });

        Hooks.on("createToken", (token) => {
            this.refresh();
        });

        Hooks.on("deleteToken", (token) => {
            this.refresh();
        });

    }

    /* -------------------------------------------- */

    /** @override */
	static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
        id: "tokenbar-window",
        template: "./modules/monks-tokenbar/templates/tokenbar.html",
        popOut: setting('popout-tokenbar')
    });
    }

	/* -------------------------------------------- */

    /** @override */
    getData(options) {
        let css = [
            ((game.world.system == "dnd5e" || game.world.system == "sw5e" ) && (game.settings.get(game.world.system, 'disableExperienceTracking')) ? 'hidexp' : null),
            !game.user.isGM ? "hidectrl" : null
        ].filter(c => !!c).join(" ");
        let pos = this.getPos();
        return {
            tokens: this.tokens,
            stat1icon: setting("stat1-icon"),
            stat2icon: setting("stat2-icon"),
            cssClass: css,
            pos: pos
        };
    }

    //show() {
        //$(this.element).removeClass('loading').css({ display: 'flex !important' });
    //}

    getPos() {
        this.pos = game.user.getFlag("monks-tokenbar", "position");

        if (this.pos == undefined) {
            let hbpos = $('#hotbar').position();
            let width = $('#hotbar').width();
            this.pos = { left: hbpos.left + width + 4, right: '', top: '', bottom: 10 };
            game.user.setFlag("monks-tokenbar", "position", this.pos);
        }

        let result = '';
        if (this.pos != undefined) {
            result = Object.entries(this.pos).filter(k => {
                return k[1] != null;
            }).map(k => {
                return k[0] + ":" + k[1] + 'px';
            }).join('; ');
        }

        return result;
    }

    setPos() {
        this.pos = game.user.getFlag("monks-tokenbar", "position");

        if (this.pos == undefined) {
            let hbpos = $('#hotbar').position();
            let width = $('#hotbar').width();
            this.pos = { left: hbpos.left + width + 4, right: '', top: '', bottom: 10 };
            game.user.setFlag("monks-tokenbar", "position", this.pos);
        }

        log('Setting position', this.pos, this.element);
        $(this.element).css(this.pos);

        return this;
    }

    refresh() {
        var that = this;
        if (this.refreshTimer == null) {
            this.refreshTimer = setTimeout(function () {
                that.getCurrentTokens();
                that.refreshTimer = null;
            }, 100);
        }
    }

    static processStat (formula, data) {
        if (formula == undefined)
            return null;

        let dataRgx = new RegExp(/([a-z.0-9_\-]+)/gi);
        let result = formula.replace(dataRgx, (match, term) => {
            let value = getProperty(data, term);
            return (value === undefined ? match : String(value).trim());
        });

        if (result == undefined)
            return null;

        try {
            result = eval(result);
        } catch{ }

        return String(result);
    }

    async mapToken(token) {
        let actor = token.actor;

        let stat1 = TokenBar.processStat(setting("stat1-resource"), actor.data.data);
        let stat2 = TokenBar.processStat(setting("stat2-resource"), actor.data.data);

        token.unsetFlag("monks-tokenbar", "notified");

        let resources = [{}, {}];
        if (game.settings.get("monks-tokenbar", "show-resource-bars")) {
            resources[0] = this.getResourceBar(token, "bar1");
            resources[1] = this.getResourceBar(token, "bar2");
        }

        let img = (setting("token-pictures") == "actor" && token.actor != undefined ? token.actor.data.img : token.data.img);
        //let thumb = img;
        //if (VideoHelper.hasVideoExtension(img))
        //    thumb = await ImageHelper.createThumbnail(img, { width: 48, height: 48 });
        let thumb = await ImageHelper.createThumbnail(img, { width: 48, height: 48 });

        return {
            id: token.id,
            token: token,
            img: img,
            thumb: thumb?.thumb || thumb,
            stat1: stat1,
            stat2: stat2,
            statClass: (stat1 == undefined && stat2 == undefined ? 'hidden' : ''),
            resource1: resources[0],
            resource2: resources[1]
        }
    }

    async getCurrentTokens() {
        log('Get current Tokens');
        let promises = canvas.tokens.placeables
            .filter(t => { return t.actor != undefined && t.actor?.hasPlayerOwner && (game.user.isGM || t.actor?.owner) && t.actor?.data.type != 'npc'; })
            .sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); })
            .map(t => { return this.mapToken(t); });

        Promise.all(promises).then(response => {
            this.tokens = response;
            this.render(true);
        });
    }

    getResourceBar(token, bar) {
        let resource = {};
        if (token.data.displayBars > 0) {
            const attr = token.getBarAttribute(bar);

            if (attr != undefined && attr.type == "bar") {
                const val = Number(attr.value);
                const pct = Math.clamped(val, 0, attr.max) / attr.max;

                if (val != undefined) {
                    let color = (bar === "bar1") ? [(1 - (pct / 2)), pct, 0] : [(0.5 * pct), (0.7 * pct), 0.5 + (pct / 2)];
                    resource = { value: val, pct: (pct * 100), color: 'rgba(' + parseInt(color[0] * 255) + ',' + parseInt(color[1] * 255) + ',' + parseInt(color[2] * 255) + ', 0.7)' };
                }
            }
        }

        return resource;
    }

    async updateToken(tkn) {
        let getAttrProperty = function (data, prop) {
            let value = getProperty(data, prop);
            return value?.value || value;
        }
        //is the token different from our token element?
        //need to check the tokens resource bars getProperty(data.data, tkn.token.data.bar2.attribute)
        //and need to check the stat values
        //and need to check the image
        let diff = {};
        if (tkn?.resource1?.value != tkn.token.getBarAttribute('bar1')?.value) { //getAttrProperty(tkn.token.actor.data.data, tkn.token.data.bar1.attribute)) {
            diff.resource1 = this.getResourceBar(tkn.token, "bar1");
        }
        if (tkn?.resource2?.value != tkn.token.getBarAttribute('bar2')?.value) { //getAttrProperty(tkn.token.actor.data.data, tkn.token.data.bar2.attribute)) {
            diff.resource2 = this.getResourceBar(tkn.token, "bar2");
        }
        let stat1 = TokenBar.processStat(setting("stat1-resource"), tkn.token.actor.data.data);
        if (tkn.stat1 != stat1) {
            diff.stat1 = stat1;
            diff.statClass = (tkn.stat1 == undefined && tkn.stat2 == undefined ? 'hidden' : '');
        }
        let stat2 = TokenBar.processStat(setting("stat2-resource"), tkn.token.actor.data.data);
        if (tkn.stat2 != stat2) {
            diff.stat2 = stat2;
            diff.statClass = (tkn.stat1 == undefined && tkn.stat2 == undefined ? 'hidden' : '');
        }
        if (tkn.img != (setting("token-pictures") == "actor" && tkn.token.actor != undefined ? tkn.token.actor.data.img : tkn.token.data.img)) {
            diff.img = (setting("token-pictures") == "actor" && tkn.token.actor != undefined ? tkn.token.actor.data.img : tkn.token.data.img);
            //let thumb = diff.img;
            //if (VideoHelper.hasVideoExtension(diff.img))
            //    thumb = await ImageHelper.createThumbnail(diff.img, { width: 48, height: 48 });
            let thumb = await ImageHelper.createThumbnail(diff.img, { width: 48, height: 48 });

            diff.thumb = (thumb?.thumb || thumb);

        }

        if (Object.keys(diff).length > 0) {
            log('preUpdateTokenBarToken', tkn, diff);
            mergeObject(tkn, diff);
            //let idx = this.tokens.map(function (e) { return e.id; }).indexOf(tkn.id);
            //if (idx != -1)
            //    this.tokens[idx] = this.mapToken(tkn.token);
            log('updateTokenBarToken', tkn);
            this.render();
        }
    }

	/* -------------------------------------------- */

    /**
    * Collapse the Hotbar, minimizing its display.
    * @return {Promise}    A promise which resolves once the collapse animation completes
    */
    /*async collapse() {
        if ( this._collapsed ) return true;
        const toggle = this.element.find(".bar-toggle");
        const icon = toggle.children("i");
        const bar = this.element.find("#token-action-bar");
        return new Promise(resolve => {
            bar.slideUp(200, () => {
            bar.addClass("collapsed");
            icon.removeClass("fa-caret-down").addClass("fa-caret-up");
            this._collapsed = true;
            resolve(true);
            });
        });
    }*/

	/* -------------------------------------------- */

    /**
    * Expand the Hotbar, displaying it normally.
    * @return {Promise}    A promise which resolves once the expand animation completes
    */
    /*
    expand() {
        if ( !this._collapsed ) return true;
        const toggle = this.element.find(".bar-toggle");
        const icon = toggle.children("i");
        const bar = this.element.find("#token-action-bar");
        return new Promise(resolve => {
            bar.slideDown(200, () => {
            bar.css("display", "");
            bar.removeClass("collapsed");
            icon.removeClass("fa-caret-up").addClass("fa-caret-down");
            this._collapsed = false;
            resolve(true);
            });
        });
    }*/

	/* -------------------------------------------- */
    /*  Event Listeners and Handlers
	/* -------------------------------------------- */

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Macro actions
        //html.find('.bar-toggle').click(this._onToggleBar.bind(this));
        if (game.user.isGM) {
            html.find(".request-roll").click(this._onRequestRoll.bind(this));
            html.find(".contested-roll").click(this._onContestedRoll.bind(this));
            html.find(".assign-xp").click(this._onAssignXP.bind(this));
        }
        html.find(".token").click(this._onClickToken.bind(this)).dblclick(this._onDblClickToken.bind(this)).hover(this._onHoverToken.bind(this));

        if (!setting('popout-tokenbar')) {
            html.find('#tokenbar-move-handle').mousedown(ev => {
                ev.preventDefault();
                ev = ev || window.event;
                let isRightMB = false;
                if ("which" in ev) { // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
                    isRightMB = ev.which == 3;
                } else if ("button" in ev) { // IE, Opera 
                    isRightMB = ev.button == 2;
                }

                if (!isRightMB) {
                    dragElement(document.getElementById("tokenbar"));
                    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

                    function dragElement(elmnt) {
                        elmnt.onmousedown = dragMouseDown;
                        function dragMouseDown(e) {
                            e = e || window.event;
                            e.preventDefault();
                            pos3 = e.clientX;
                            pos4 = e.clientY;

                            if (elmnt.style.bottom != undefined) {
                                elmnt.style.top = elmnt.offsetTop + "px";
                                elmnt.style.bottom = null;
                            }

                            document.onmouseup = closeDragElement;
                            document.onmousemove = elementDrag;
                        }

                        function elementDrag(e) {
                            e = e || window.event;
                            e.preventDefault();
                            // calculate the new cursor position:
                            pos1 = pos3 - e.clientX;
                            pos2 = pos4 - e.clientY;
                            pos3 = e.clientX;
                            pos4 = e.clientY;
                            // set the element's new position:
                            elmnt.style.bottom = null;
                            elmnt.style.right = null
                            elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
                            elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
                            elmnt.style.position = 'fixed';
                            elmnt.style.zIndex = 100;
                        }

                        function closeDragElement() {
                            // stop moving when mouse button is released:
                            elmnt.onmousedown = null;
                            elmnt.style.zIndex = null;
                            document.onmouseup = null;
                            document.onmousemove = null;

                            let xPos = Math.clamped((elmnt.offsetLeft - pos1), 0, window.innerWidth - 200);
                            let yPos = Math.clamped((elmnt.offsetTop - pos2), 0, window.innerHeight - 20);

                            let position = { top: null, bottom: null, left: null, right: null };
                            if (yPos > (window.innerHeight / 2))
                                position.bottom = (window.innerHeight - yPos - elmnt.offsetHeight);
                            else
                                position.top = yPos + 1;

                            //if (xPos > (window.innerWidth / 2))
                            //    position.right = (window.innerWidth - xPos);
                            //else
                            position.left = xPos + 1;

                            elmnt.style.bottom = (position.bottom ? position.bottom + "px" : null);
                            elmnt.style.right = (position.right ? position.right + "px" : null);
                            elmnt.style.top = (position.top ? position.top + "px" : null);
                            elmnt.style.left = (position.left ? position.left + "px" : null);

                            //$(elmnt).css({ bottom: (position.bottom || ''), top: (position.top || ''), left: (position.left || ''), right: (position.right || '') });

                            log(`Setting monks-tokenbar position:`, position);
                            game.user.setFlag('monks-tokenbar', 'position', position);
                            this.pos = position;
                        }
                    }
                }
            });
        }

        // Activate context menu
        this._contextMenu(html);
    }

    _contextMenu(html) {
        let context = new ContextMenu(html, ".token", [
            {
                name: "MonksTokenBar.PrivateMessage",
                icon: '<i class="fas fa-microphone"></i>',
                condition: li => {
                    const entry = this.tokens.find(t => t.id === li[0].dataset.tokenId);
                    let players = game.users.entities
                        .filter(u =>
                            !u.isGM && (entry.token.actor.data.permission[u.id] == 3 || entry.token.actor.data.permission.default == 3)
                    );
                    return players.length > 0;
                },
                callback: li => {
                    const entry = this.tokens.find(t => t.id === li[0].dataset.tokenId);
                    let players = game.users.entities
                    .filter(u =>
                        !u.isGM && (entry.token.actor.data.permission[u.id] == 3 || entry.token.actor.data.permission.default == 3)
                    )
                    .map(u => {
                        return u.name;
                    });
                    $("#chat-message").val('/w ' + players.join(' ') + ' ');
                    $("#chat-message").focus();
                }
            },
            {
                name: "MonksTokenBar.EditCharacter",
                icon: '<i class="fas fa-edit"></i>',
                callback: li => {
                    const entry = this.tokens.find(t => t.id === li[0].dataset.tokenId);
                    if (entry.token.actor) entry.token.actor.sheet.render(true);
                }
            },
            {
                name: "MonksTokenBar.EditToken",
                icon: '<i class="fas fa-edit"></i>',
                callback: li => {
                    const entry = this.tokens.find(t => t.id === li[0].dataset.tokenId);
                    if (entry.token.actor) entry.token.sheet.render(true)
                }
            },
            {
                name: "MonksTokenBar.TargetToken",
                icon: '<i class="fas fa-bullseye"></i>',
                condition: game.user.isGM,
                callback: li => {
                    const entry = this.tokens.find(t => t.id === li[0].dataset.tokenId);
                    const targeted = !entry.token.isTargeted;
                    entry.token.setTarget(targeted, { releaseOthers: false });
                }
            }
        ]);
    }

    getEntry(id) {
        return this.tokens.find(t => t.id === id);
    }

    async _onRequestRoll(event) {
        event.preventDefault();

        this.savingthrow = new SavingThrowApp().render(true);
    }

    async _onContestedRoll(event) {
        event.preventDefault();

        this.contestedroll = new ContestedRollApp().render(true);
    }

    async _onAssignXP(event) {
        event.preventDefault();

        new AssignXPApp().render(true);
    }

    /* -------------------------------------------- */

    /**
    * Handle left-click events to
    * @param event
    * @private
    */
    async _onClickToken(event) {
        event.preventDefault();
        const li = event.currentTarget;
        const entry = this.tokens.find(t => t.id === li.dataset.tokenId);

        log('Center on token', entry, entry.token);
        entry?.token?.control({ releaseOthers: true });
        return canvas.animatePan({ x: entry?.token?.x, y: entry?.token?.y });
    }

    async _onDblClickToken(event) {
        event.preventDefault();
        const li = event.currentTarget;
        const entry = this.tokens.find(t => t.id === li.dataset.tokenId);

        if (entry.token.actor)
            entry.token.actor.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
    * Handle hover events on a macro button to track which slot is the hover target
    * @param {Event} event   The originating mouseover or mouseleave event
    * @private
    */
    _onHoverToken(event) {
        event.preventDefault();
        const li = event.currentTarget;
        const hasAction = !li.classList.contains("inactive");

        // Remove any existing tooltip
        const tooltip = li.querySelector(".tooltip");
        if ( tooltip ) li.removeChild(tooltip);

        // Handle hover-in
        if ( event.type === "mouseenter" ) {
            this._hover = li.dataset.tokenId;
            if (hasAction) {
                const entry = this.tokens.find(t => t.id === li.dataset.tokenId);
                const tooltip = document.createElement("SPAN");
                tooltip.classList.add("tooltip");
                tooltip.textContent = entry.token.name;
                li.appendChild(tooltip);
            }
        }

        // Handle hover-out
        else {
            this._hover = null;
        }
    }

    /* -------------------------------------------- */

    /**
    * Handle click events to toggle display of the macro bar
    * @param {Event} event
    * @private
    */
    /*
    _onToggleBar(event) {
        event.preventDefault();
        if ( this._collapsed ) this.expand();
        else this.collapse();
    }*/
}

//Hooks.on('renderTokenBar', (app, html) => {
    //MonksTokenBar.tokenbar.setPos().show();
    //if (!app.ready) {
    //    app.show(); //setPos().show();
     //   app.ready = true;
    //}

    /*
    if (setting('popout-tokenbar') && MonksTokenBar.tokenbar.element[0] != undefined) {
        MonksTokenBar.tokenbar.element[0].style.width = null;
        MonksTokenBar.tokenbar.setPosition();
    }*/
    //MonksTokenBar.tokenbar._getTokensByScene();
    //let gMovement = game.settings.get("monks-tokenbar", "movement");
    //$('.token-movement[data-movement="' + gMovement + '"]', html).addClass('active');

    //does the scene have an active combat
    //let combats = game.combats.filter(c => {
    //    return c?.scene?.id == game.scenes?.viewed?.id && c.started;
    //});

    //$('.token-movement[data-movement="combat"]', html).toggleClass('disabled', combats.length == 0);
    /*$(app.tokens).each(function () {
        let tMovement = this.token.getFlag("monks-tokenbar", "movement");
        if (tMovement != undefined && tMovement != gMovement) {
            $('.token[data-token-id="' + this.id + '"] .movement-icon', html).attr('movement', tMovement);
        }
    });*/

    //if (game.world.system == "dnd5e") {
    //    $('.assign-xp', html).css({ visibility: (game.settings.get('dnd5e', 'disableExperienceTracking') ? 'hidden' : 'visible') });
    //} else {
        //$('.dialog-col', html).hide();
    //}
    //$('.dialog-col', html).toggle(game.user.isGM);

//});

Hooks.on('updateToken', (scene, token, data) => {
    if (game.user.isGM && MonksTokenBar.tokenbar != undefined) { //&& game.settings.get("monks-tokenbar", "show-resource-bars")
        let tkn = MonksTokenBar.tokenbar.tokens.find(t => t.token.id == token._id);
        if (tkn != undefined) { // && (data.bar1 != undefined || data.bar2 != undefined)) {
            MonksTokenBar.tokenbar.updateToken(tkn)
        }
    }
});

Hooks.on('updateOwnedItem', (actor, item, data) => {
    if (game.user.isGM && MonksTokenBar.tokenbar != undefined) { //&& game.settings.get("monks-tokenbar", "show-resource-bars")
        let tkn = MonksTokenBar.tokenbar.tokens.find(t => t.token.actor.id == actor._id);
        if (tkn != undefined) { // && (data.bar1 != undefined || data.bar2 != undefined)) {
            setTimeout(function () { MonksTokenBar.tokenbar.updateToken(tkn); }, 100); //delay slightly so the PF2E condition can be rendered properly.
        }
    }
});

Hooks.on('updateActor', (actor, data) => {
    if (game.user.isGM && MonksTokenBar.tokenbar != undefined) { //&& game.settings.get("monks-tokenbar", "show-resource-bars") 
        let tkn = MonksTokenBar.tokenbar.tokens.find(t => t.token.actor._id == actor._id);
        if (tkn != undefined) {
            /*if (data?.attributes?.ac != undefined
                || data?.skills?.prc != undefined
                || data?.data?.customModifiers?.ac != undefined
                || data?.data?.customModifiers?.perception != undefined
                || data?.data?.abilities?.wis != undefined
                || data?.data?.abilities?.dex != undefined
                || getProperty(data.data, tkn.token.data.bar1.attribute) != undefined
                || getProperty(data.data, tkn.token.data.bar2.attribute) != undefined)
            {*/
            MonksTokenBar.tokenbar.updateToken(tkn)
            //}
        } else if (data.permission != undefined) {
            MonksTokenBar.tokenbar.refresh();
        }
    }
});

