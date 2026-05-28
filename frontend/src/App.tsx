import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import { ParticipantProvider } from "./components/ParticipantProvider";
import Dashboard from "./pages/Dashboard";
import Datasets from "./pages/Datasets";
import DatasetDetailPage from "./pages/DatasetDetail";
import Models from "./pages/Models";
import Prompts from "./pages/Prompts";
import Runs from "./pages/Runs";
import RunDetail from "./pages/RunDetail";
import Insights from "./pages/Insights";
import Refinement from "./pages/Refinement";

export default function App() {
  return (
    <ParticipantProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="datasets" element={<Datasets />} />
          <Route path="datasets/:id" element={<DatasetDetailPage />} />
          <Route path="models" element={<Models />} />
          <Route path="prompts" element={<Prompts />} />
          <Route path="runs" element={<Runs />} />
          <Route path="runs/:id" element={<RunDetail />} />
          <Route path="insights" element={<Insights />} />
          <Route path="refinement" element={<Refinement />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ParticipantProvider>
  );
}
