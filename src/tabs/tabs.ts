﻿import { customElement, children, bindable, bindingMode, observable } from 'aurelia-framework';
import { Tab } from './tab';

// @containerless
@customElement('bs-tabs')
export class Tabs {
    private selectedTab: Tab;

    @children('bs-tab')
    tabs: Tab[] = [];

    @bindable({ defaultBindingMode: bindingMode.twoWay })
    selectedTabId: string = '';

    @observable
    private internalTabs: Tab[] = [];

    bind() {
        if (this.tabs.length > 0) {
            this.updateSelectedTab();
        } else {
            // TODO: Hack for Edge: Remove when https://github.com/aurelia/templating/issues/403 is solved
            setTimeout(() => {
                this.updateSelectedTab();
            });
        }
    }

    selectTab(tab: Tab) {
        if (this.internalTabs.find(t => t === tab)) {
            this.internalTabs.forEach(t => t.active = t === tab);
            if (this.selectedTabId !== tab.id) {
                this.selectedTab = tab;
                this.selectedTabId = tab.id;
            }
        } else
            throw Error('Tab could not be found.');
    }

    tabsChanged() {
        this.internalTabs = this.tabs ? this.tabs : [];
        this.updateSelectedTab();
    }

    selectedTabIdChanged() {
        this.updateSelectedTab();
    }

    private updateSelectedTab() {
        if (this.selectedTabId) {
            let tabs = this.internalTabs.filter((t) => t.id === this.selectedTabId);
            if (tabs.length > 0) {
                this.selectTab(tabs[0]);
                return;
            }
        }

        if (this.internalTabs.length > 0) {
            this.selectTab(this.internalTabs[0]);
        }
    }
}