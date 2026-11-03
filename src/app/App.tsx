import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StyleguidePage } from '../features/styleguide/StyleguidePage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/styleguide" element={<StyleguidePage />} />
        <Route path="*" element={<Navigate to="/styleguide" replace />} />
      </Routes>
    </HashRouter>
  );
}
