import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Anchor,
  Box,
  Container,
  Title,
  Text,
  Button,
  Table,
  Group,
  Stack,
  Badge,
  ActionIcon,
  Modal,
  TextInput,
  PasswordInput,
  Select,
  Alert,
  Card,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconAlertCircle,
  IconUsers,
  IconArrowLeft,
} from '@tabler/icons-react';
import { getUsers, createUser, updateUser, deleteUser } from '@/api/users';
import type { UserRecord, CreateUserData, UpdateUserData } from '@/api/users';
import { formatDate } from '@/utils/format';
import { validateEmail, validatePassword } from '@/utils/validation';
import { getApiErrorMessage } from '@/utils/errors';
import TopBar from '@/components/TopBar';
import SkeletonList from '@/components/SkeletonList';
import EmptyStateCard from '@/components/EmptyStateCard';
import LoadErrorAlert from '@/components/LoadErrorAlert';

function CreateUserModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreateUserData>({
    initialValues: {
      email: '',
      displayName: '',
      password: '',
      role: 'user',
    },
    validateInputOnBlur: true,
    validateInputOnChange: ['email'],
    validate: {
      email: (value) => {
        // Don't nag before they've even typed an "@" — they're mid-local-part.
        if (value && !value.includes('@')) return null;
        return validateEmail(value);
      },
      displayName: (value) =>
        !value.trim() ? 'Display name is required' : null,
      password: validatePassword,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: CreateUserData) => createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      form.reset();
      setError(null);
      onClose();
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, 'Failed to create user'));
    },
  });

  const handleClose = () => {
    form.reset();
    setError(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Create User"
      size="md"
      closeOnClickOutside={false}
    >
      {error && (
        <Alert
          icon={<IconAlertCircle size={18} />}
          color="red"
          variant="light"
          mb="md"
          onClose={() => setError(null)}
          withCloseButton
        >
          {error}
        </Alert>
      )}

      <form onSubmit={form.onSubmit((values) => mutation.mutate(values))} noValidate>
        <Stack gap="md">
          <TextInput
            label="Email"
            placeholder="user@example.com"
            type="email"
            withAsterisk
            {...form.getInputProps('email')}
          />
          <TextInput
            label="Display Name"
            placeholder="John Doe"
            withAsterisk
            {...form.getInputProps('displayName')}
          />
          <PasswordInput
            label="Password"
            placeholder="Min. 8 characters"
            withAsterisk
            {...form.getInputProps('password')}
          />
          <Select
            label="Role"
            data={[
              { value: 'user', label: 'User' },
              { value: 'instance_admin', label: 'Instance Admin' },
            ]}
            {...form.getInputProps('role')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Create User
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function EditUserModal({
  opened,
  onClose,
  user,
}: {
  opened: boolean;
  onClose: () => void;
  user: UserRecord | null;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<UpdateUserData & { password: string }>({
    initialValues: {
      email: '',
      displayName: '',
      password: '',
      role: 'user',
    },
    validateInputOnBlur: true,
    validateInputOnChange: ['email'],
    validate: {
      email: (value) => {
        if (value && !value.includes('@')) return null;
        return validateEmail(value ?? '');
      },
      displayName: (value) => {
        if (!value || !value.trim()) return 'Display name is required';
        return null;
      },
      // Edit-mode password is optional — empty means "don't change"
      password: (value) => {
        if (value && value.length < 8) return 'Password must be at least 8 characters';
        return null;
      },
    },
  });

  // Reseed the form whenever the edited user changes (keyed on id so we
  // don't clobber in-progress edits while the same user is open).
  useEffect(() => {
    if (user) {
      form.setValues({
        email: user.email,
        displayName: user.displayName,
        password: '',
        role: user.role,
      });
      form.resetDirty();
      form.resetTouched();
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const mutation = useMutation({
    mutationFn: (data: UpdateUserData) => updateUser(user!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setError(null);
      onClose();
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, 'Failed to update user'));
    },
  });

  const handleSubmit = (values: UpdateUserData & { password: string }) => {
    const updates: UpdateUserData = {};
    if (values.email && values.email !== user?.email) updates.email = values.email;
    if (values.displayName && values.displayName !== user?.displayName) updates.displayName = values.displayName;
    if (values.role && values.role !== user?.role) updates.role = values.role;
    if (values.password) updates.password = values.password;
    mutation.mutate(updates);
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Edit User"
      size="md"
      closeOnClickOutside={false}
    >
      {error && (
        <Alert
          icon={<IconAlertCircle size={18} />}
          color="red"
          variant="light"
          mb="md"
          onClose={() => setError(null)}
          withCloseButton
        >
          {error}
        </Alert>
      )}

      <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
        <Stack gap="md">
          <TextInput
            label="Email"
            placeholder="user@example.com"
            type="email"
            withAsterisk
            {...form.getInputProps('email')}
          />
          <TextInput
            label="Display Name"
            placeholder="John Doe"
            withAsterisk
            {...form.getInputProps('displayName')}
          />
          <PasswordInput
            label="New Password"
            placeholder="Leave blank to keep current"
            {...form.getInputProps('password')}
          />
          <Select
            label="Role"
            data={[
              { value: 'user', label: 'User' },
              { value: 'instance_admin', label: 'Instance Admin' },
            ]}
            {...form.getInputProps('role')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Save Changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function DeleteUserModal({
  opened,
  onClose,
  user,
}: {
  opened: boolean;
  onClose: () => void;
  user: UserRecord | null;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => deleteUser(user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setError(null);
      onClose();
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, 'Failed to delete user'));
    },
  });

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Delete User" size="sm">
      {error && (
        <Alert
          icon={<IconAlertCircle size={18} />}
          color="red"
          variant="light"
          mb="md"
          onClose={() => setError(null)}
          withCloseButton
        >
          {error}
        </Alert>
      )}

      <Stack gap="md">
        <Text size="sm">
          Are you sure you want to deactivate{' '}
          <Text span fw={600}>
            {user?.displayName}
          </Text>{' '}
          ({user?.email})?
        </Text>
        <Alert color="sunset" variant="light" icon={<IconAlertCircle size={16} />}>
          The user will lose access immediately. This action can be reversed by an
          administrator.
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
          >
            Delete User
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function UsersPage() {
  const navigate = useNavigate();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const users = data?.items || [];

  return (
    <Box mih="100vh" bg="var(--mantine-color-body)">
      <TopBar />

      {/* Main content */}
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Anchor
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <IconArrowLeft size={14} />
            Back to Dashboard
          </Anchor>

          <Group justify="space-between" align="center">
            <Group gap="sm">
              <IconUsers size={28} stroke={1.5} />
              <Title order={2}>Users</Title>
            </Group>
            <Button
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateModalOpen(true)}
            >
              Create User
            </Button>
          </Group>
          <Text c="dimmed" size="sm">
            Manage accounts that can sign in to this Laiven instance.
          </Text>

          {isLoading ? (
            <SkeletonList height={52} />
          ) : error ? (
            <LoadErrorAlert
              error={error}
              fallback="Failed to load users. Make sure you have administrator permissions."
              onRetry={() => refetch()}
            />
          ) : users.length === 0 ? (
            <EmptyStateCard
              icon={<IconUsers size={48} stroke={1} color="var(--mantine-color-dimmed)" />}
              title="No users found"
              description="Create your first user to get started."
              action={{
                label: 'Create user',
                icon: <IconPlus size={16} />,
                onClick: () => setCreateModalOpen(true),
              }}
            />
          ) : (
            <Card withBorder radius="md" p={0}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Email</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th w={100}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {users.map((user) => (
                    <Table.Tr key={user.id}>
                      <Table.Td>
                        <Text fw={500} size="sm">
                          {user.displayName}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {user.email}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={user.role === 'instance_admin' ? 'indigo' : 'gray'}
                          variant="light"
                          size="sm"
                        >
                          {user.role === 'instance_admin' ? 'Admin' : 'User'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {formatDate(user.createdAt)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Tooltip label="Edit user">
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              color="blue"
                              onClick={() => setEditUser(user)}
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Delete user">
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              color="red"
                              onClick={() => setDeleteTarget(user)}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          )}
        </Stack>
      </Container>

      <CreateUserModal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
      <EditUserModal
        opened={!!editUser}
        onClose={() => setEditUser(null)}
        user={editUser}
      />
      <DeleteUserModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        user={deleteTarget}
      />
    </Box>
  );
}
