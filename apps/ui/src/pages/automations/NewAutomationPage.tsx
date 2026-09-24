import { FC } from "react";
import { AutomationEditor } from "./AutomationPage/editor/AutomationEditor";

/** A new automation opens straight on its tree: a trigger, then one action. */
const NewAutomationPage: FC = () => (
  <AutomationEditor mode={{ kind: "create" }} />
);

export default NewAutomationPage;
