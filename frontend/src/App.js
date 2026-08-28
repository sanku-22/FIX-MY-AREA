import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import MapHome from "@/pages/MapHome";
import IssueDetail from "@/pages/IssueDetail";
import MyIssues from "@/pages/MyIssues";
import AdminDashboard from "@/pages/AdminDashboard";
import BottomNav from "@/components/BottomNav";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MapHome />} />
          <Route path="/issue/:id" element={<IssueDetail />} />
          <Route path="/my-issues" element={<MyIssues />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
        <BottomNav />
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
