import {Settings} from "../Settings.js";
import {getDataFrom, sanitizeUuid} from "../helpers/Utility.js";
import {DefaultComponent} from "../Recipe.js";
import {RecipeCompendium} from "./RecipeCompendium.js";

const anyOfSheets: { [key: string]: AnyOfSheet } = {};

export class AnyOfSheet {
    app;
    item;
    editable: boolean;
    anyOf: AnyOf;
    anyOfElement?;
    checkItem?;


    static bind(app, html, data) {
        if (isAnyOf(app.item)) {
            if (!anyOfSheets[app.id]) {
                anyOfSheets[app.id] = new AnyOfSheet(app, data);
            }
            anyOfSheets[app.id].init(html);
        }
    }

    constructor(app, data) {
        this.app = app;
        this.item = app.item;
        this.editable = data.editable;
        this.addDragDrop();

    }

    init(html) {
        this.anyOf = new AnyOf(this.item);
        if (html[0].localName !== "div") {
            html = $(html[0].parentElement.parentElement);
        }
        let exists = html.find(".sheet-body .beavers-crafting");
        if (exists.length != 0) {
            return;
        }
        this.anyOfElement = $('<div class="beavers-crafting"></div>');
        html.find(".sheet-body").empty();
        html.find(".sheet-body").append(this.anyOfElement);
        this.render();
    }

    async render() {
        let macroResult:MacroResult<boolean> = {value:true};
        if (this.checkItem) {
            macroResult = await this.anyOf.executeMacro(this.checkItem);
        }
        let template = await renderTemplate('modules/beavers-crafting/templates/anyof-sheet.hbs',
            {anyOf: this.anyOf, editable: this.editable, checkItem: this.checkItem, macroResult: macroResult});
        this.anyOfElement.find('.anyOf').remove();
        this.anyOfElement.append(template);
        this.handleEvents();
    }

    handleEvents() {
        this.anyOfElement.find('button').click(e => {
            return this.render();
        });
    }

    addDragDrop() {
        if (this.editable) {
            const dragDrop = new DragDrop({
                dropSelector: '.sheet-body',
                permissions: {
                    dragstart: this.app._canDragStart.bind(this.app),
                    drop: this.app._canDragDrop.bind(this.app)
                },
                callbacks: {
                    dragstart: this.app._onDragStart.bind(this.app),
                    dragover: this.app._onDragOver.bind(this.app),
                    drop: this._onDrop.bind(this)
                }
            });
            this.app._dragDrop.push(dragDrop);
            dragDrop.bind(this.app.form);
        }
    }

    async _onDrop(e) {
        const isDropArea = $(e.target).hasClass("drop-area")
        if (!isDropArea) {
            return;
        }
        const data = getDataFrom(e);
        if (data && (data.type === "Item")) {
            this.checkItem = await fromUuid(data.uuid);
        }
        this.render();
    }

}

export function isAnyOf(item) {
    // @ts-ignore
    return (item?.type === 'loot' && item?.system?.source === Settings.ANYOF_SUBTYPE);
}

interface AnyOfStoreData {
    macro: string
}

export class AnyOf {
    macro;
    img;
    name;

    constructor(item) {
        const flags = item.flags[Settings.NAMESPACE]?.anyOf;
        const data = mergeObject(this.defaultData(), flags || {}, {inplace: false});
        this.macro = data.macro;
        this.img = item.img;
        this.name = item.name;
    }

    defaultData() {
        return {
            macro: "",
        }
    }

    serialize(): AnyOfStoreData {
        const serialized = {
            macro: this.macro,
        }
        return serialized;
    }

    async executeMacro(item): Promise<MacroResult<boolean>> {
        const AsyncFunction = (async function () {
        }).constructor;
        // @ts-ignore
        const fn = new AsyncFunction("item", this.macro);
        const result = {
            value:false,
            error: undefined
        }
        try {
            result.value = await fn(item);
        } catch (err) {
            // @ts-ignore
            logger.error(err);
            result.error = err;
        }
        return result;
    }

    async filter(itemList): Promise<Component[]>{
        const resultList:Component[] = [];
        for(const item of itemList){
            const result = await this.executeMacro(item);
            if(result.value){
                const same = resultList.filter(component => RecipeCompendium.isSame(item,component))
                if(same.length > 0){
                    same[0].quantity = same[0].quantity + item.system?.quantity;
                }else{
                    resultList.push(new DefaultComponent(item,item.uuid,"Item"));
                }
            }
        }
        return resultList;
    }

}