import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Center, Loader } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import { SESSION_EXPIRED_EVENT } from '@/api/client';

// Pages
import LoginPage from '@/pages/LoginPage';
import SetupPage from '@/pages/SetupPage';
import DashboardPage from '@/pages/DashboardPage';
import UsersPage from '@/pages/UsersPage';
import ProfilePage from '@/pages/ProfilePage';
import ProjectSettingsPage from '@/pages/ProjectSettingsPage';
// Lazy-loaded pages
const WordSearchPage = lazy(() => import('@/pages/WordSearchPage'));
const WordEditorPage = lazy(() => import('@/pages/WordEditorPage'));
const AttributesPage = lazy(() => import('@/pages/AttributesPage'));
const VariablesPage = lazy(() => import('@/pages/VariablesPage'));
const RulesLibraryPage = lazy(() => import('@/pages/RulesLibraryPage'));
const WordRulesPage = lazy(() => import('@/pages/WordRulesPage'));
const DerivativeRulesPage = lazy(() => import('@/pages/DerivativeRulesPage'));
const BuildersPage = lazy(() => import('@/pages/BuildersPage'));
const DerivativeTypesPage = lazy(() => import('@/pages/DerivativeTypesPage'));
const NodeEditorPage = lazy(() => import('@/pages/NodeEditorPage'));

function Loading() {
  return <Center h="100vh"><Loader /></Center>;
}

// Listens for 401s from the API client and navigates to the login page
// without a full document reload — keeping in-memory state (unsaved form
// input, react-query cache seeds) intact for the post-login flow.
function SessionExpiredListener() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    function handler() {
      queryClient.clear();
      navigate('/login?expired=1');
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, [navigate, queryClient]);

  return null;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <SessionExpiredListener />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/users" element={<ProtectedRoute requireAdmin><UsersPage /></ProtectedRoute>} />

          {/* Project routes with sidebar layout */}
          <Route path="/projects/:projectId" element={<AppLayout />}>
            <Route index element={<WordSearchPage />} />
            <Route path="words/new" element={<WordEditorPage />} />
            <Route path="words/:wordId" element={<WordEditorPage />} />
            <Route path="attributes" element={<AttributesPage />} />
            <Route path="variables" element={<VariablesPage />} />
            <Route path="rules/library" element={<RulesLibraryPage />} />
            <Route path="rules/word" element={<WordRulesPage />} />
            <Route path="rules/derivatives" element={<DerivativeRulesPage />} />
            <Route path="builders" element={<BuildersPage />} />
            <Route path="derivative-types" element={<DerivativeTypesPage />} />
            <Route path="settings" element={<ProjectSettingsPage />} />
          </Route>

          {/* Node editor (full screen, no sidebar) */}
          <Route path="/projects/:projectId/rules/:ruleId/editor" element={<NodeEditorPage />} />
          <Route path="/projects/:projectId/builders/:builderId/editor" element={<NodeEditorPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
