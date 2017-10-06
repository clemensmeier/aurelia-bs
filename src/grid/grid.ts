import { customElement, inject, bindable, children, Container, View, ViewCompiler, ViewResources, ViewSlot } from 'aurelia-framework';
import { computedFrom, bindingMode } from 'aurelia-binding';

import { Column } from './column';
import { Deferred } from './deferred';
import { ResizeContainer } from '../resize-container';

export interface GridDataRequest {
    skip: number;
    take: number;

    sortColumn: Column | undefined;
    sortOrder: 'asc' | 'desc';

    filter: string;
}

export interface GridDataResponse {
    items: any[] | undefined;
    filteredCount: number;
    totalCount: number;
}

export enum SelectionMode {
    none = <any>'none',
    single = <any>'single',
    multiple = <any>'multiple'
}

export let GridDefaults = {
    offset: 75,
    itemHeight: 36,
    hideUnfilteredCounter: false,
};

/**
 * The datagrid component can be used to display complex datasets. Specify the
 * columns to display using <column> tags.
 * Example:
 *
 *   <datagrid rows.bind="myDataset">
 *     <column field="name"></column>
 *     <column field="comments" sortable="false">
 *       ${row.comments | newlines}
 *     </column>
 *     <column field="customer reference"></column>
 *     <column field="deadline" searchable="false" sorter.bind="myDateSorter">
 *   </datagrid>
 *
 * See the @bindable properties on the Datagrid and Column classes for all
 * available configuration options.
 */
@inject(Container, Element, ViewCompiler, ViewResources)
@customElement('bs-grid')
export class Grid extends ResizeContainer {
    /**
	 * Defines the locale to use for sorting strings, defaults to browser default.
	 */
    public static LOCALE: string;

    @bindable
    loadData: (request: GridDataRequest) => Promise<GridDataResponse> = (request) => {
        return Promise.resolve(<GridDataResponse>{
            items: this.actualRows ? this.actualRows.slice(request.skip, request.skip + request.take) : undefined,
            filteredCount: this.actualRows ? this.actualRows.length : -1,
            totalCount: this.rows ? this.rows.length : -1
        });
    }

    @bindable
    comparer = (a: any, b: any) => a && a.id && b && b.id ? a.id === b.id : a === b

    @bindable
    offset = GridDefaults.offset;

    @bindable
    limitToContentHeight = false;

    @bindable
    height: number | null = null;

    @children('bs-column')
    columns: Column[] = [];

    /**
	 * The data to display, given as rows of simple objects.
	 */
    @bindable
    rows: any[];

    /**
	 * Set to false to disable sorting in the entire datagrid. You can also
	 * disable sorting for individual columns: see Column.sortable.
	 */
    @bindable
    sortable = true;

    /**
	 * Column to sort on when the grid is first rendered, identified by field.
	 * If not set the first sortable column will be used to sort.
	 */
    @bindable
    defaultSortColumn: string;

    /**
	 * Order to sort in when the grid is first rendered.
	 */
    @bindable
    defaultSortOrder: 'asc' | 'desc' = 'asc';

    /**
	 * Set to false to disable animation when first showing the datagrid.
	 */
    @bindable
    animate = true;

    @bindable
    totalCount = -1;

    filteredCount = -1;
    currentIndex = 0;
    pageSize = 0;

    @bindable({ defaultBindingMode: bindingMode.twoWay })
    selectedItem: any = undefined;

    @bindable({ defaultBindingMode: bindingMode.twoWay })
    selectedItems: any[] = [];

    @bindable
    selectionMode = SelectionMode.none;

    @bindable
    enabled = true;

    @bindable
    filter: string = '';

    @bindable
    itemHeight = GridDefaults.itemHeight;

    sortColumn: Column | undefined;
    sortOrder: 'asc' | 'desc';

    /** Sets the additional row CSS classes ('row' is available in the binding). */
    @bindable
    rowClass = '';

    showFooter = false;

    /** Set to false to not automatically initialize data, a manual call to refresh() is required to initialize the data. */
    @bindable
    autoInit = true;

    @bindable
    hideUnfilteredCounter = GridDefaults.hideUnfilteredCounter;

    @computedFrom('filteredCount', 'pageSize')
    get pageCount() {
        return Math.ceil((this.filteredCount > 0 ? this.filteredCount : 1) / this.pageSize);
    }

    @computedFrom('currentIndex', 'pageSize')
    get currentPage() {
        return this.getPageNumberForIndex(this.currentIndex);
    }

    @computedFrom('sortable', 'rows')
    get rowsSortable() {
        return this.sortable;
    }

    @computedFrom('currentPage', 'pageCount')
    get pages() {
        let pages = [];
        for (let i = this.currentPage - 3; i < this.currentPage + 3 + 1; i++) {
            if (i >= 0 && i < this.pageCount)
                pages.push(i);
        }
        return pages;
    }

    /**
	 * You can use this in your cell templates to reference the binding context
	 * in which the datagrid is used.
	 */
    parent: any;
    actualRows: any[] | undefined;
    displayedRows: any[] | undefined;

    constructor(private container: Container,
        element: Element,
        private viewCompiler: ViewCompiler,
        private viewResources: ViewResources) {
        super(element);
    }

    bind(bindingContext: any) {
        this.isBound = true;
        this.parent = bindingContext;
    }

    attached() {
        /* TODO: Workaround until aurelia-binding issue #347 is resolved. */
        if (typeof this.animate === 'string')
            this.animate = (<any>this.animate).toLowerCase() === 'false' ? false : true;
        if (typeof this.sortable === 'string')
            this.sortable = (<any>this.sortable).toLowerCase() === 'false' ? false : true;

        this.isBound = true;
        this.pageSize = 0;
        this.body.viewSlot = new ViewSlot(this.bodyElement, true);
        this.header.viewSlot = new ViewSlot(this.headerElement, true);
        this.footer.viewSlot = new ViewSlot(this.headerElement, true);

        this.processColumns();
        this.refreshInternal();

        super.attached();

        this.containerHeightChanged();
        setTimeout(() => {
            this.processColumns();
            this.refreshInternal();
        });
    }

    detached() {
        if (this.body.viewSlot) {
            this.body.viewSlot.removeAll();
            this.body.viewSlot = null;
        }

        if (this.header.viewSlot) {
            this.header.viewSlot.removeAll();
            this.header.viewSlot = null;
        }

        if (this.footer.viewSlot) {
            this.footer.viewSlot.removeAll();
            this.footer.viewSlot = null;
        }

        super.detached();
    }

    unbind() {
        this.isBound = false;
    }

    loadDataChanged() {
        this.refreshInternal();
    }

    columnsChanged() {
        Promise.all(this.columns.map(c => c.waitForBinding())).then(() => this.processColumns());
    }

    rowsChanged() {
        this.refreshInternal();
    }

    filterChanged() {
        this.refreshInternal();
    }

    private timer: any;
    containerHeightChanged() {
        if (this.isBound && this.containerHeight > 0) {
            if (this.timer)
                clearTimeout(this.timer);

            // console.log('height: ' + this.containerHeight + ', pageSize: ' + this.pageSize);

            let previousPageSize = this.pageSize;
            this.pageSize = Math.floor((this.containerHeight - this.itemHeight) / this.itemHeight);

            if (previousPageSize !== this.pageSize) {
                if (this.displayedRows && this.displayedRows.length > this.pageSize)
                    this.displayedRows = this.displayedRows.slice(0, this.pageSize);

                this.timer = setTimeout(() => {
                    this.pageSize = Math.floor((this.containerHeight - this.itemHeight) / this.itemHeight);
                    if (this.body) {
                        this.refreshInternal();
                    }
                }, 100);
            }
        }
    }

    private dirty = false;
    private isBound = false;
    private refreshingGrid = false;

    getCurrentGridDataRequest() {
        return <GridDataRequest>{
            skip: this.pageSize * this.currentPage,
            take: this.pageSize,
            sortColumn: this.sortColumn,
            sortOrder: this.sortOrder,
            filter: this.filter
        };
    }

    async refresh() {
        this.autoInit = true;
        await this.refreshInternal();
    }

    private async refreshInternal() {
        this.actualRows = this.rows ? this.sortItems(this.filterItems(this.rows)) : undefined;

        if (!this.autoInit || !this.loadData || !this.isBound || this.pageSize === 0)
            return;

        if (!this.refreshingGrid) {
            this.refreshingGrid = true;
            let result = await this.loadData(this.getCurrentGridDataRequest());

            this.totalCount = result.totalCount;
            this.filteredCount = result.filteredCount;
            this.displayedRows = result.items;

            if (this.filteredCount !== -1 && this.currentIndex > this.filteredCount)
                this.currentIndex = 0;

            if (this.bodyElement) {
                if (this.body.scrollListener)
                    this.bodyElement.removeEventListener('scroll', this.body.scrollListener);

                this.bodyElement.scrollTop = 0;
                this.bodyElement.classList.add('scrollable-bottom');
                this.body.scrollListener = () => this.onBodyScroll();
                this.bodyElement.addEventListener('scroll', this.body.scrollListener);
            }

            this.rendered = true;
            this.refreshingGrid = false;

            if (this.dirty) {
                this.dirty = false;
                await this.refreshInternal();
            }
        } else
            this.dirty = true;
    }

    getPageNumberForIndex(index: number) {
        return Math.floor(index / this.pageSize);
    }

    async showItemAtIndex(index: number) {
        let previousCurrentPage = this.currentPage;
        this.currentIndex = index;
        let currentPage = this.currentPage;
        if (previousCurrentPage !== currentPage) {
            await this.refreshInternal();
        }
    }

    async showPage(pageNumber: number) {
        if (pageNumber !== this.currentPage && pageNumber >= 0 && pageNumber < this.pageCount) {
            this.currentIndex = this.pageSize * pageNumber;
            await this.refreshInternal();
            return true;
        }
        return false;
    }

    onColumnHeaderClick(column: Column) {
        if (!column.sortable || !this.rowsSortable)
            return;

        if (column === this.sortColumn)
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        else {
            if (this.sortColumn) {
                this.sortColumn.sortedOrder = null;
            }

            this.sortColumn = column;
            this.sortOrder = 'asc';
        }

        this.sortColumn.sortedOrder = this.sortOrder;
        return this.refreshInternal();
    }

    // Local row filtering and sorting

    private filterItems(items: any[]) {
        let term = this.filter ? this.filter.toLowerCase().trim() : '';
        let terms = term.split(' ');

        return !term ? items : items.filter(row => {
            return terms.every(t => {
                return this.columns.some(column => {
                    if (!column.searchable) {
                        return false;
                    }

                    let values = column.field.map(veld => this.getObjectValueFromPath(veld, row));
                    if (column.matcher) {
                        return column.matcher.bind(this.parent)(t, values);
                    }

                    for (let i in values) {
                        let value = String(values[i]);
                        if (value.toLowerCase().indexOf(t) !== -1) {
                            return true;
                        }
                    }

                    return false;
                });
            });
        });
    }

    private sortItems(items: any[]) {
        let orderMultiplier = this.sortOrder === 'asc' ? 1 : -1;
        if (this.sortColumn && this.sortColumn.sorter) {
            return items.slice().sort((a: any, b: any) => {
                return this.sortColumn!.sorter(a, b) * orderMultiplier;
            });
        } else if (this.sortColumn) {
            let fields = this.sortColumn!.field;
            return items.slice().sort((aRow: any, bRow: any) => {
                let aValues = fields.map(field => this.getObjectValueFromPath(field, aRow));
                let bValues = fields.map(field => this.getObjectValueFromPath(field, bRow));
                return this.defaultCompare(aValues, bValues) * orderMultiplier;
            });
        } else
            return items;
    }

    private defaultCompare(aValues: any[], bValues: any[]) {
        for (let i in aValues) {
            if (aValues[i] === undefined && bValues[i] !== undefined)
                return -1;
            else if (bValues[i] === undefined && aValues[i] !== undefined)
                return 1;

            if (typeof aValues[i] === 'string') {
                let comp = aValues[i].localeCompare(bValues[i], Grid.LOCALE);
                if (comp !== 0)
                    return comp;
            } else if (aValues[i] !== bValues[i])
                return aValues[i] < bValues[i] ? -1 : 1;
        }

        return 0;
    }

    private getObjectValueFromPath(field: string, obj: any) {
        let result: any = obj;
        let parts = field.split('.');
        for (let part of parts) {
            result = result ? result[part] : undefined;
        }
        return result;
    }

    // Rendering the data grid

    public rendered = false;

    public bodyElement: HTMLElement;
    private body = {
        scrollListener: <any>null,
        borderHeight: <any>null,
        viewSlot: <ViewSlot | null>null,
        viewAttached: new Deferred<void>()
    };

    public headerElement: HTMLElement;
    private header = {
        viewSlot: <ViewSlot | null>null,
    };

    public footerElement: HTMLElement;
    private footer = {
        viewSlot: <ViewSlot | null>null,
    };

    protected getResizedChild() {
        return this.element.children[1] as HTMLElement;
    }

    protected getContainerHeight(child: HTMLElement) {
        return this.height ? parseInt(<any>this.height) : super.getContainerHeight(child);
    }

    // TODO
    // @throttle(100)
    private onBodyScroll() {
        if (this.body.borderHeight === null) {
            this.body.borderHeight = 0;
            let styles = getComputedStyle(this.bodyElement);
            this.body.borderHeight += parseInt(styles.borderTopWidth!, 10);
            this.body.borderHeight += parseInt(styles.borderBottomWidth!, 10);
        }

        let scrollBottom = this.bodyElement.scrollHeight - this.bodyElement.offsetHeight + this.body.borderHeight;

        if (scrollBottom === 0) {
            this.bodyElement.classList.remove('scrollable-top');
            this.bodyElement.classList.remove('scrollable-bottom');
            return;
        }

        if (this.bodyElement.scrollTop === 0) {
            this.bodyElement.classList.remove('scrollable-top');
        } else {
            this.bodyElement.classList.add('scrollable-top');
        }
        if (this.bodyElement.scrollTop === scrollBottom) {
            this.bodyElement.classList.remove('scrollable-bottom');
        } else {
            this.bodyElement.classList.add('scrollable-bottom');
        }
    }

    private processColumnsCallback = () => this.processColumns();
    private processColumns() {
        let columns = this.columns;
        if (!columns || columns.length === 0) {
            columns = [];
            for (let i = 0; i < this.element.children.length; i++) {
                let e: any = this.element.children[i];
                if (e.au && e.au.controller && e.au.controller.viewModel) {
                    columns.push(e.au.controller.viewModel);
                }
            }
        }

        if (columns) {
            if (columns.length > 0 &&
                columns[0].rowHeader !== false &&
                !columns.some(column => column.rowHeader)) {
                columns[0].rowHeader = true;
            }

            this.compileRowTemplate(columns);
            this.compileHeaderTemplate(columns);

            this.showFooter = columns.some(column => column.footer !== undefined && column.footer.trim().length > 0);
            if (this.showFooter) {
                this.compileFooterTemplate(columns);
            }

            columns.forEach(c => {
                c.element.removeEventListener('update', this.processColumnsCallback);
                c.element.addEventListener('update', this.processColumnsCallback);
            });

            if (columns.length > 0)
                this.initializeDefaultSortOrder();
        }
    }

    private initializeDefaultSortOrder() {
        if (!this.sortColumn) {
            if (this.defaultSortColumn)
                this.sortColumn = this.columns.find(column => column.field && column.field.indexOf(this.defaultSortColumn) !== -1);
            else
                this.sortColumn = this.columns.find(column => column.sortable);

            if (this.sortColumn) {
                this.sortOrder = this.defaultSortOrder;
                this.sortColumn.sortedOrder = this.sortOrder;
            }
        }
    }

    protected selectRow(row: any) {
        if (this.enabled) {
            if (this.selectionMode === SelectionMode.single) {
                this.selectedItem = this.comparer(this.selectedItem, row) ? undefined : row;
                this.dispatchSelectionChangedEvent();
            } else if (this.selectionMode === SelectionMode.multiple) {
                this.selectedItems = this.selectedItems && this.selectedItems.filter(a => this.comparer(a, row)).length > 0 ?
                    this.selectedItems.filter(i => !this.comparer(i, row)) :
                    (this.selectedItems ? this.selectedItems.slice().concat([row]) : [row]);

                this.selectedItem = this.selectedItems && this.selectedItems.length <= 1 ?
                    this.selectedItems[0] :
                    undefined;

                this.dispatchSelectionChangedEvent();
            }
        }
    }

    private dispatchSelectionChangedEvent() {
        setTimeout(() => {
            let event = new CustomEvent('selection-changed', {
                detail: {
                    selectedItem: this.selectedItem,
                    selectedItems: this.selectedItems,
                }
            });
            this.element.dispatchEvent(event);
        });
    }

    protected isSelected(selectedItem: any, selectedItems: any[], item: any) {
        return selectedItems && (this.comparer(selectedItem, item) || selectedItems.filter(a => this.comparer(a, item)).length > 0);
    }

    private compileRowTemplate(columns: Column[]) {
        if (this.body.viewSlot) {
            let rowClass = this.element.getAttribute('row-class.bind');
            if (!rowClass) rowClass = this.element.getAttribute('row-class.one-way');
            if (!rowClass) rowClass = '\'rowClass\'';

            let row = document.createElement('tr');
            row.setAttribute('repeat.for', 'row of displayedRows');
            row.setAttribute('click.trigger', 'selectRow(row)');
            row.setAttribute('style.bind', `selectionMode !== 'none' ? (enabled ? 'cursor: pointer' : 'cursor: not-allowed') : ''`);
            row.setAttribute('class.bind', `isSelected(selectedItem, selectedItems, row) ? ('selected ' + (` + rowClass + `)) : (` + rowClass + `)`);

            let view = this.columnsToView(columns, (column: Column, index: number) => {
                const el = column.rowHeader ? 'th' : 'td';
                return `<${el} class.bind="columns[${index}].cellClass" style.bind="(columns[${index}].width ? 'width: ' + columns[${index}].width + 'px;' : '')">${column.cellTemplate}</${el}>`;
            }, row);

            attachView(view, this.body.viewSlot).then(() => {
                if (!this.body.viewAttached.isResolved()) {
                    this.body.viewAttached.resolve();
                }
            });
        }
    }

    private compileHeaderTemplate(columns: Column[]) {
        if (this.header.viewSlot) {
            let view = this.columnsToView(columns, (column: Column, index: number) => {
                return `<th class="\${columns[${index}].headerClass} \${columns[${index}].sortable && rowsSortable ? 'sortable' : ''} \${columns[${index}].sortedOrder && rowsSortable ? 'sorted ' + columns[${index}].sortedOrder : ''}"
                    style.bind="(columns[${index}].width ? 'width: ' + columns[${index}].width + 'px;' : '') + (columns[${index}].sortable && rowsSortable ? 'cursor: pointer' : '')"
                    click.trigger="onColumnHeaderClick(columns[${index}])">
                    ${column.header || ''}
                    <span if.bind="columns[${index}].sortable && rowsSortable && sortColumn === columns[${index}] && sortOrder === 'asc'" aria-hidden="true">&#9650;</span>
                    <span if.bind="columns[${index}].sortable && rowsSortable && sortColumn === columns[${index}] && sortOrder === 'desc'" aria-hidden="true">&#9660;</span>
                </th>`;
            });

            attachView(view, this.header.viewSlot);
        }
    }

    private compileFooterTemplate(columns: Column[]) {
        if (this.footer.viewSlot) {
            let view = this.columnsToView(columns, (column: Column, index: number) => {
                return `<td class="\${columns[${index}].footerClass} \${columns[${index}].sortable && rowsSortable ? 'sortable' : ''} \${columns[${index}].sortedOrder && rowsSortable ? 'sorted ' + columns[${index}].sortedOrder : ''}">
                    ${column.footer || ''}
                </td>`;
            });

            attachView(view, this.footer.viewSlot);
        }
    }

    private columnsToView(columns: Column[], templateMapper: (column: Column, index: number) => string, row?: HTMLElement): View {
        if (!row) {
            row = document.createElement('tr');
        }
        row.innerHTML = columns.map((column, index) => templateMapper(column, index)).join('\n');

        let template = document.createDocumentFragment();
        template.appendChild(row);

        let view = this.viewCompiler.compile(template, this.viewResources).create(this.container);
        view.bind(this);

        return view;
    }
}

export function attachView(view: View, viewSlot: ViewSlot): Promise<any> {
    let attachView = () => {
        viewSlot.add(view);
        viewSlot.attached();
    };
    viewSlot.detached();
    let removeResponse = viewSlot.removeAll();
    if (removeResponse instanceof Promise) {
        return removeResponse.then(attachView);
    }
    attachView();
    return Promise.resolve(null);
}