import { defineBoxButtonElement } from "@unofficialbox/box-open-elements/components/actions/button";
import { defineBoxMenuElement } from "@unofficialbox/box-open-elements/components/actions/menu";
import { defineBoxSegmentedControlElement } from "@unofficialbox/box-open-elements/components/actions/segmented-control";
import { defineBoxTreeGridElement } from "@unofficialbox/box-open-elements/components/collections/tree-grid";
import { defineBoxEmptyStateElement } from "@unofficialbox/box-open-elements/components/feedback/empty-state";
import { defineBoxSpinnerElement } from "@unofficialbox/box-open-elements/components/feedback/spinner";
import { defineBoxSelectElement } from "@unofficialbox/box-open-elements/components/forms/select";
import { defineBoxSwitchElement } from "@unofficialbox/box-open-elements/components/forms/switch";
import { defineBoxTextAreaElement } from "@unofficialbox/box-open-elements/components/forms/text-area";
import { defineBoxTextFieldElement } from "@unofficialbox/box-open-elements/components/forms/text-field";
import { defineBoxDropZoneElement } from "@unofficialbox/box-open-elements/components/files/drop-zone";
import { defineBoxAvatarElement } from "@unofficialbox/box-open-elements/components/identity/avatar";
import { defineBoxAppShellElement } from "@unofficialbox/box-open-elements/components/layout/app-shell";
import { defineBoxSectionElement } from "@unofficialbox/box-open-elements/components/layout/section";
import { defineBoxSplitViewElement } from "@unofficialbox/box-open-elements/components/layout/split-view";
import { defineBoxTabsElement } from "@unofficialbox/box-open-elements/components/navigation/tabs";
import { defineBoxDialogElement } from "@unofficialbox/box-open-elements/components/overlays/dialog";
import {
  applyDesignTokens,
  registerBoxDefaultDesignSystem,
} from "@unofficialbox/box-open-elements/foundations/tokens";

export function bootstrapDesignSystem(): void {
  registerBoxDefaultDesignSystem({ setActive: true });
  applyDesignTokens(document.documentElement, "box-default");
}

export function defineLabElements(): void {
  defineBoxAppShellElement();
  defineBoxSplitViewElement();
  defineBoxSectionElement();
  defineBoxDialogElement();
  defineBoxTabsElement();
  defineBoxButtonElement();
  defineBoxMenuElement();
  defineBoxSegmentedControlElement();
  defineBoxTextFieldElement();
  defineBoxTextAreaElement();
  defineBoxSelectElement();
  defineBoxSwitchElement();
  defineBoxSpinnerElement();
  defineBoxEmptyStateElement();
  defineBoxAvatarElement();
  defineBoxTreeGridElement();
  defineBoxDropZoneElement();
}
