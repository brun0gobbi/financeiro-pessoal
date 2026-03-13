import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MainDashboard } from './pages/MainDashboard';
import { Dashboard } from './pages/Dashboard';
import { Pendencias } from './pages/Pendencias';
import { Importar } from './pages/Importar';
import { Historico } from './pages/Historico';
import { Configuracoes } from './pages/Configuracoes';
import { ItauDashboard } from './pages/ItauDashboard';
import { TempoReal } from './pages/TempoReal';
import './index.css';

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <MainDashboard />,
      },
      {
        path: "cartoes",
        element: <Dashboard />, // Combined cards view
      },
      {
        path: "nubank",
        element: <Dashboard source="NUBANK" />,
      },
      {
        path: "xp",
        element: <Dashboard source="XP" />,
      },
      {
        path: "itau",
        element: <ItauDashboard />,
      },
      {
        path: "tempo-real",
        element: <TempoReal />,
      },
      {
        path: "pendencias",
        element: <Pendencias />,
      },
      {
        path: "importar",
        element: <Importar />,
      },
      {
        path: "historico",
        element: <Historico />,
      },
      {
        path: "configuracoes",
        element: <Configuracoes />,
      },
    ],
  },
]);

import { Toaster } from 'sonner';

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
    </>
  );
}

export default App;


