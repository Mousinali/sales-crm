import { ModuleRegistry, AllCommunityModule } from "ag-charts-community";

// AG Charts v10+ needs its modules registered once before any chart is
// created — importing this file (for its side effect) from every chart
// component is cheap and idempotent, so there's no single shared entry
// point required.
ModuleRegistry.registerModules([AllCommunityModule]);
