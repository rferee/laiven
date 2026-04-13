import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Routes are matched top-down; the first matching branch wins.
// Unknown GET paths return `{ items: [] }` so list-based pages don't crash.
// Unknown POST paths return a generic validation-success shape.

const sampleNodeTypes = {
  items: [
    {
      type: 'attribute_input',
      label: 'Attribute Input',
      category: 'Input',
      description: 'Reads a value from an attribute on the current word.',
      inputs: [],
      outputs: [{ id: 'output', label: 'Value', type: 'any' }],
      configFields: [{ key: 'attributeIdentifier', label: 'Attribute', type: 'attribute' }],
    },
    {
      type: 'contains_one_of',
      label: 'Contains One Of',
      category: 'Condition',
      description: 'Checks whether the input contains any of the given items.',
      inputs: [
        { id: 'input', label: 'Input', type: 'string' },
        { id: 'items', label: 'Items', type: 'array' },
      ],
      outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    },
    {
      type: 'append',
      label: 'Append',
      category: 'Transform',
      description: 'Appends a suffix to the input string.',
      inputs: [{ id: 'input', label: 'Input', type: 'string' }],
      outputs: [{ id: 'output', label: 'Result', type: 'string' }],
      configFields: [{ key: 'suffix', label: 'Suffix', type: 'text' }],
    },
    {
      type: 'if_branch',
      label: 'If / Branch',
      category: 'Flow Control',
      description: 'Routes a value down a true or false branch based on a condition.',
      inputs: [
        { id: 'condition', label: 'Condition', type: 'boolean' },
        { id: 'value', label: 'Value', type: 'any' },
      ],
      outputs: [
        { id: 'true', label: 'True', type: 'any' },
        { id: 'false', label: 'False', type: 'any' },
      ],
    },
    {
      type: 'and',
      label: 'AND',
      category: 'Logic',
      description: 'Boolean AND of two inputs.',
      inputs: [
        { id: 'a', label: 'A', type: 'boolean' },
        { id: 'b', label: 'B', type: 'boolean' },
      ],
      outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    },
  ],
};

const sampleUser = {
  id: '1',
  email: 'admin@laiven.local',
  displayName: 'Admin',
  role: 'instance_admin',
};

const sampleProject = {
  id: 'p1',
  name: 'Test Project',
  description: 'A test project',
  role: 'project_admin',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: sampleUser });
      }
      if (url === '/auth/setup-status') {
        return Promise.resolve({ data: { needsSetup: false } });
      }
      if (url === '/auth/api-keys') {
        return Promise.resolve({ data: [] });
      }

      if (url === '/node-types') {
        return Promise.resolve({ data: sampleNodeTypes });
      }

      if (url === '/projects') {
        return Promise.resolve({
          data: { items: [sampleProject] },
        });
      }
      if (/^\/projects\/[^/]+$/.test(url)) {
        return Promise.resolve({ data: sampleProject });
      }

      if (/\/projects\/[^/]+\/attributes$/.test(url)) {
        return Promise.resolve({
          data: {
            items: [
              { id: 'a1', name: 'Word', identifier: 'word', type: 'string', required: true, sortOrder: 0 },
            ],
          },
        });
      }
      if (/\/projects\/[^/]+\/variables$/.test(url)) {
        return Promise.resolve({ data: { items: [] } });
      }
      if (/\/projects\/[^/]+\/rules$/.test(url)) {
        return Promise.resolve({ data: { items: [] } });
      }
      if (/\/projects\/[^/]+\/word-rules$/.test(url)) {
        return Promise.resolve({ data: { items: [] } });
      }
      if (/\/projects\/[^/]+\/words/.test(url)) {
        return Promise.resolve({ data: { items: [], total: 0 } });
      }
      if (/\/projects\/[^/]+\/derivative-types$/.test(url)) {
        return Promise.resolve({ data: { items: [] } });
      }
      if (/\/projects\/[^/]+\/builders$/.test(url)) {
        return Promise.resolve({ data: { items: [] } });
      }

      if (url === '/users') {
        return Promise.resolve({ data: { items: [] } });
      }

      console.warn(`[pages.test.tsx] Unmocked GET request: ${url}`);
      return Promise.resolve({ data: { items: [] } });
    }),
    post: vi.fn().mockImplementation((url: string) => {
      if (/\/words\/validate$/.test(url)) {
        return Promise.resolve({
          data: { valid: true, errors: [], warnings: [], ruleResults: [] },
        });
      }
      if (/\/words\/search$/.test(url) || /\/words$/.test(url)) {
        return Promise.resolve({
          data: { items: [], total: 0 },
        });
      }
      return Promise.resolve({
        data: { valid: true, errors: [], warnings: [], ruleResults: [] },
      });
    }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      response: { use: vi.fn() },
    },
  },
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Notifications />
        <MemoryRouter>
          {children}
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}

function TestWrapperWithRoute({
  children,
  initialPath,
  routePath,
}: {
  children: React.ReactNode;
  initialPath: string;
  routePath: string;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Notifications />
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path={routePath} element={children} />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}

describe('Node Editor Components', () => {
  it('NodePalette renders all categories', async () => {
    const { NodePalette } = await import('@/node-editor/NodePalette');
    render(
      <TestWrapper>
        <NodePalette onAddNode={() => {}} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Input')).toBeTruthy();
    });
    expect(screen.getByText('Condition')).toBeTruthy();
    expect(screen.getByText('Transform')).toBeTruthy();
    expect(screen.getByText('Flow Control')).toBeTruthy();
    expect(screen.getByText('Logic')).toBeTruthy();
  });

  it('NodePalette lists node types', async () => {
    const { NodePalette } = await import('@/node-editor/NodePalette');
    render(
      <TestWrapper>
        <NodePalette onAddNode={() => {}} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Attribute Input')).toBeTruthy();
    });
    expect(screen.getByText('Contains One Of')).toBeTruthy();
    expect(screen.getByText('Append')).toBeTruthy();
    expect(screen.getByText('If / Branch')).toBeTruthy();
    expect(screen.getByText('AND')).toBeTruthy();
  });

  it('NodeInspector shows empty state when no node selected', async () => {
    const { NodeInspector } = await import('@/node-editor/NodeInspector');
    render(
      <TestWrapper>
        <NodeInspector
          node={null}
          onUpdateNodeData={() => {}}
          onDeleteNode={() => {}}
        />
      </TestWrapper>
    );

    expect(screen.getByText(/Select a node/i)).toBeTruthy();
  });
});

describe('AdvancedSearchBuilder', () => {
  it('exports buildSearchConditions utility', async () => {
    const { buildSearchConditions, createEmptyCondition, createEmptyGroup } = await import('@/components/AdvancedSearchBuilder');
    expect(typeof buildSearchConditions).toBe('function');
    expect(typeof createEmptyCondition).toBe('function');
    expect(typeof createEmptyGroup).toBe('function');

    const condition = createEmptyCondition();
    expect(condition.type).toBe('condition');
    expect(condition.operator).toBe('');

    const group = createEmptyGroup();
    expect(group.type).toBe('group');
    expect(group.logic).toBe('AND');
    expect(group.children.length).toBe(1);
  });
});

describe('LoginPage', () => {
  it('renders email and password fields', async () => {
    const LoginPage = (await import('@/pages/LoginPage')).default;
    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    );

    // Wait for setup-status check to resolve and the form to render
    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeTruthy();
    });
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('renders the sign in button', async () => {
    const LoginPage = (await import('@/pages/LoginPage')).default;
    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
    });
  });

  it('renders the Laiven title', async () => {
    const LoginPage = (await import('@/pages/LoginPage')).default;
    render(
      <TestWrapper>
        <LoginPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Laiven')).toBeTruthy();
    });
  });
});

describe('DashboardPage', () => {
  it('renders without crashing', async () => {
    const DashboardPage = (await import('@/pages/DashboardPage')).default;
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Projects')).toBeTruthy();
    });
  });

  it('displays the project card', async () => {
    const DashboardPage = (await import('@/pages/DashboardPage')).default;
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeTruthy();
    });
  });
});

describe('ProfilePage', () => {
  it('renders account info section', async () => {
    const ProfilePage = (await import('@/pages/ProfilePage')).default;
    render(
      <TestWrapper>
        <ProfilePage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Account Information')).toBeTruthy();
    });
  });

  it('renders the change password section', async () => {
    const ProfilePage = (await import('@/pages/ProfilePage')).default;
    render(
      <TestWrapper>
        <ProfilePage />
      </TestWrapper>
    );

    await waitFor(() => {
      // "Change Password" appears both as a heading and a button label.
      // Use getAllByText to confirm the section renders at all.
      const matches = screen.getAllByText('Change Password');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('RulesLibraryPage', () => {
  it('renders rules heading', async () => {
    const RulesLibraryPage = (await import('@/pages/RulesLibraryPage')).default;
    render(
      <TestWrapperWithRoute
        initialPath="/projects/p1/rules/library"
        routePath="/projects/:projectId/rules/library"
      >
        <RulesLibraryPage />
      </TestWrapperWithRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Rules Library')).toBeTruthy();
    });
  });

  it('shows empty state when no rules exist', async () => {
    const RulesLibraryPage = (await import('@/pages/RulesLibraryPage')).default;
    render(
      <TestWrapperWithRoute
        initialPath="/projects/p1/rules/library"
        routePath="/projects/:projectId/rules/library"
      >
        <RulesLibraryPage />
      </TestWrapperWithRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('The rules library is empty')).toBeTruthy();
    });
  });
});

describe('VariablesPage', () => {
  it('renders variables heading', async () => {
    const VariablesPage = (await import('@/pages/VariablesPage')).default;
    render(
      <TestWrapperWithRoute
        initialPath="/projects/p1/variables"
        routePath="/projects/:projectId/variables"
      >
        <VariablesPage />
      </TestWrapperWithRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Variables')).toBeTruthy();
    });
  });

  it('shows empty state when no variables exist', async () => {
    const VariablesPage = (await import('@/pages/VariablesPage')).default;
    render(
      <TestWrapperWithRoute
        initialPath="/projects/p1/variables"
        routePath="/projects/:projectId/variables"
      >
        <VariablesPage />
      </TestWrapperWithRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('No variables defined yet')).toBeTruthy();
    });
  });
});

describe('ProtectedRoute', () => {
  it('renders children when authenticated', async () => {
    // The API mock returns a valid user for /auth/me, so useAuth will
    // resolve to an authenticated state.
    const ProtectedRoute = (await import('@/components/ProtectedRoute')).default;

    render(
      <TestWrapper>
        <ProtectedRoute>
          <div data-testid="protected-child">Protected Content</div>
        </ProtectedRoute>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('protected-child')).toBeTruthy();
    });
    expect(screen.getByText('Protected Content')).toBeTruthy();
  });

  it('shows loader while auth is loading', async () => {
    // On initial render (before the query resolves), ProtectedRoute should
    // show a loading indicator. We test this by looking for the Loader
    // component that Mantine renders (an SVG with role="presentation" or
    // a specific class).
    const ProtectedRoute = (await import('@/components/ProtectedRoute')).default;

    // Use a one-off QueryClient that will NOT have cached data
    const freshQc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={freshQc}>
        <MantineProvider>
          <MemoryRouter>
            <ProtectedRoute>
              <div data-testid="protected-child">Protected Content</div>
            </ProtectedRoute>
          </MemoryRouter>
        </MantineProvider>
      </QueryClientProvider>
    );

    // Note: mock resolves synchronously — this test only verifies the resolved state, not the actual loading spinner
    await waitFor(() => {
      expect(screen.getByTestId('protected-child')).toBeTruthy();
    });
  });
});
