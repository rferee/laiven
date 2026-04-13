import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './testUtils';
import ApiKeysCard from '../ApiKeysCard';
import RevealApiKeyModal from '../RevealApiKeyModal';
import CreateApiKeyModal from '../CreateApiKeyModal';
import * as authApi from '@/api/auth';
import * as projectsApi from '@/api/projects';

vi.mock('@/api/auth', () => ({
  getApiKeys: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

vi.mock('@/api/projects', () => ({
  getProjects: vi.fn().mockResolvedValue({ items: [] }),
}));

describe('ApiKeysCard', () => {
  it('renders the empty state when no keys exist', async () => {
    renderWithProviders(<ApiKeysCard />);
    await waitFor(() => {
      expect(screen.getByText(/no api keys yet/i)).toBeInTheDocument();
    });
  });

  it('renders each API key as a row with scope info', async () => {
    (authApi.getApiKeys as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'k1',
        name: 'CI key',
        keyPrefix: 'lv_abc12',
        projectId: null,
        role: null,
        createdAt: '2026-04-01T00:00:00Z',
        lastUsedAt: null,
      },
      {
        id: 'k2',
        name: 'Editor bot',
        keyPrefix: 'lv_xyz98',
        projectId: 'p1',
        role: 'editor',
        createdAt: '2026-04-10T00:00:00Z',
        lastUsedAt: '2026-04-12T00:00:00Z',
      },
    ]);
    (projectsApi.getProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [{ id: 'p1', name: 'Eldarian', description: null, createdBy: 'u1', createdAt: '', updatedAt: '' }],
    });

    renderWithProviders(<ApiKeysCard />);

    await waitFor(() => {
      expect(screen.getByText('CI key')).toBeInTheDocument();
    });
    expect(screen.getByText('Editor bot')).toBeInTheDocument();
    expect(screen.getByText('All projects')).toBeInTheDocument();
    expect(screen.getByText('Eldarian')).toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('revokes a key after the user confirms the prompt', async () => {
    (authApi.getApiKeys as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          id: 'k1',
          name: 'CI key',
          keyPrefix: 'lv_abc12',
          projectId: null,
          role: null,
          createdAt: '2026-04-01T00:00:00Z',
          lastUsedAt: null,
        },
      ])
      .mockResolvedValueOnce([]);
    (authApi.deleteApiKey as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (projectsApi.getProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ items: [] });

    renderWithProviders(<ApiKeysCard />);
    await waitFor(() => expect(screen.getByText('CI key')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /revoke api key/i }));
    // Confirm modal's primary button label is "Revoke"
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(authApi.deleteApiKey).toHaveBeenCalledWith('k1');
    });
  });

  it('successful create triggers the reveal modal with the raw key', async () => {
    (authApi.getApiKeys as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (projectsApi.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    (authApi.createApiKey as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'k9',
      name: 'from-ui',
      keyPrefix: 'lv_new123',
      projectId: null,
      role: null,
      createdAt: '2026-04-13T00:00:00Z',
      lastUsedAt: null,
      key: 'lv_new123SECRETTAIL',
    });

    renderWithProviders(<ApiKeysCard />);
    await userEvent.click(await screen.findByRole('button', { name: /create api key/i }));

    await userEvent.type(await screen.findByLabelText(/name/i), 'from-ui');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(authApi.createApiKey).toHaveBeenCalledWith({ name: 'from-ui' });
    });

    // Reveal modal shows the raw key
    expect(await screen.findByDisplayValue('lv_new123SECRETTAIL')).toBeInTheDocument();
  });
});

describe('RevealApiKeyModal', () => {
  it('shows the raw key and copies it to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const onClose = vi.fn();
    renderWithProviders(
      <RevealApiKeyModal
        apiKey={{
          id: 'k1',
          name: 'test',
          keyPrefix: 'lv_abc12',
          projectId: null,
          role: null,
          createdAt: '2026-04-01T00:00:00Z',
          lastUsedAt: null,
          key: 'lv_abc12defghijk',
        }}
        onClose={onClose}
      />,
    );

    const input = screen.getByDisplayValue('lv_abc12defghijk') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.readOnly).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith('lv_abc12defghijk');

    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when apiKey is null', () => {
    const { container } = renderWithProviders(
      <RevealApiKeyModal apiKey={null} onClose={() => {}} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('CreateApiKeyModal validation', () => {
  beforeEach(() => {
    (projectsApi.getProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        { id: 'p1', name: 'Eldarian', description: null, createdBy: 'u1', createdAt: '', updatedAt: '' },
      ],
    });
  });

  it('requires a non-empty name', async () => {
    renderWithProviders(
      <CreateApiKeyModal opened onClose={() => {}} onCreated={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it('requires a role when a project is picked', async () => {
    renderWithProviders(
      <CreateApiKeyModal opened onClose={() => {}} onCreated={() => {}} />,
    );
    await userEvent.type(screen.getByLabelText(/name/i), 'test-key');

    // Mantine v7's Select keeps the listbox mounted in a portal and
    // aria-labelledby points at the same label as the input, so
    // getByLabelText matches both. Use the placeholder to target the input.
    await userEvent.click(screen.getByPlaceholderText(/leave blank for full access/i));
    await userEvent.click(await screen.findByText('Eldarian'));

    await userEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(await screen.findByText(/role is required/i)).toBeInTheDocument();
  });
});
