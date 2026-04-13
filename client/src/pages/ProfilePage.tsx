import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Container,
  Title,
  Text,
  Card,
  Group,
  Stack,
  Badge,
  Button,
  TextInput,
  PasswordInput,
  Alert,
  Anchor,
  Box,
  Flex,
  Divider,
  UnstyledButton,
  Menu,
  Avatar,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconUser,
  IconLock,
  IconArrowLeft,
  IconLanguage,
  IconChevronDown,
  IconLogout,
  IconLayoutDashboard,
  IconAlertCircle,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { updateProfile } from '@/api/auth';
import { getApiErrorMessage } from '@/utils/errors';
import { validatePassword, validateConfirmPassword } from '@/utils/validation';
import ApiKeysCard from './Profile/ApiKeys/ApiKeysCard';

export default function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const profileForm = useForm({
    initialValues: {
      displayName: user?.displayName ?? '',
    },
    validate: {
      displayName: (v) => (v.trim().length < 1 ? 'Display name is required' : null),
    },
  });

  const passwordForm = useForm({
    initialValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    validate: {
      currentPassword: (v) => (v.length < 1 ? 'Current password is required' : null),
      newPassword: validatePassword,
      confirmPassword: (v, values) => validateConfirmPassword(values.newPassword)(v),
    },
  });

  const profileMutation = useMutation({
    mutationFn: (values: { displayName: string }) =>
      updateProfile({ displayName: values.displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      notifications.show({
        title: 'Profile updated',
        message: 'Your display name has been saved.',
        color: 'green',
      });
    },
    onError: (err: unknown) => {
      notifications.show({
        title: 'Error',
        message: getApiErrorMessage(err, 'Failed to update profile.'),
        color: 'red',
      });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (values: { currentPassword: string; newPassword: string }) =>
      updateProfile({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      passwordForm.reset();
      notifications.show({
        title: 'Password changed',
        message: 'Your password has been updated successfully.',
        color: 'green',
      });
    },
    onError: (err: unknown) => {
      passwordForm.setFieldError('currentPassword', getApiErrorMessage(err, 'Failed to change password.'));
    },
  });

  const logoutMutation = useLogout();

  const roleLabel = user?.role === 'instance_admin' ? 'Admin' : 'User';
  const roleColor = user?.role === 'instance_admin' ? 'indigo' : 'gray';

  return (
    <Box mih="100vh" bg="var(--mantine-color-body)">
      {/* Header */}
      <Box
        component="header"
        py="sm"
        px="lg"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Flex justify="space-between" align="center">
          <Group gap="xs">
            <IconLanguage size={28} stroke={1.5} color="var(--mantine-color-atlantis-5)" />
            <Title order={3} fw={700}>
              Laiven
            </Title>
          </Group>

          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar size="sm" radius="xl" color="atlantis">
                    {user?.displayName?.charAt(0).toUpperCase() ?? 'U'}
                  </Avatar>
                  <Text size="sm" fw={500}>
                    {user?.displayName ?? 'User'}
                  </Text>
                  <IconChevronDown size={14} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Account</Menu.Label>
              <Menu.Item
                leftSection={<IconLayoutDashboard size={14} />}
                onClick={() => navigate('/')}
              >
                Dashboard
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={14} />}
                onClick={() => logoutMutation.mutate()}
              >
                Logout
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Flex>
      </Box>

      {/* Main content */}
      <Container size="sm" py="xl">
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

          <Group gap="sm">
            <IconUser size={28} stroke={1.5} />
            <Title order={2}>Profile</Title>
          </Group>
          <Text c="dimmed" size="sm">
            Manage your account settings.
          </Text>

          {/* Account Info Card */}
          <Card withBorder radius="md" padding="lg">
            <Stack gap="md">
              <Title order={4}>Account Information</Title>
              <Divider />

              <Group gap="lg" align="flex-start">
                <Text size="sm" fw={500} w={120} pt={6}>
                  Email
                </Text>
                <TextInput
                  value={user?.email ?? ''}
                  readOnly
                  disabled
                  style={{ flex: 1 }}
                />
              </Group>

              <Group gap="lg" align="flex-start">
                <Text size="sm" fw={500} w={120} pt={6}>
                  Role
                </Text>
                <Badge variant="light" color={roleColor} size="lg">
                  {roleLabel}
                </Badge>
              </Group>

              <form
                onSubmit={profileForm.onSubmit((values) => profileMutation.mutate(values))}
                noValidate
              >
                <Stack gap="md">
                  <Group gap="lg" align="flex-start">
                    <Text size="sm" fw={500} w={120} pt={6}>
                      Display Name
                    </Text>
                    <TextInput
                      placeholder="Your display name"
                      style={{ flex: 1 }}
                      {...profileForm.getInputProps('displayName')}
                    />
                  </Group>

                  <Group justify="flex-end">
                    <Button type="submit" loading={profileMutation.isPending}>
                      Save
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Stack>
          </Card>

          {/* Change Password Card */}
          <Card withBorder radius="md" padding="lg">
            <form
              onSubmit={passwordForm.onSubmit((values) => passwordMutation.mutate(values))}
              noValidate
            >
              <Stack gap="md">
                <Title order={4}>Change Password</Title>
                <Divider />

                {passwordMutation.isError && (
                  <Alert
                    icon={<IconAlertCircle size={18} />}
                    color="red"
                    variant="light"
                  >
                    {getApiErrorMessage(passwordMutation.error, 'Failed to change password.')}
                  </Alert>
                )}

                <PasswordInput
                  label="Current Password"
                  placeholder="Enter your current password"
                  withAsterisk
                  {...passwordForm.getInputProps('currentPassword')}
                />

                <PasswordInput
                  label="New Password"
                  placeholder="Min. 8 characters"
                  withAsterisk
                  {...passwordForm.getInputProps('newPassword')}
                />

                <PasswordInput
                  label="Confirm New Password"
                  placeholder="Re-enter new password"
                  withAsterisk
                  {...passwordForm.getInputProps('confirmPassword')}
                />

                <Group justify="flex-end">
                  <Button
                    type="submit"
                    loading={passwordMutation.isPending}
                    leftSection={<IconLock size={16} />}
                  >
                    Change Password
                  </Button>
                </Group>
              </Stack>
            </form>
          </Card>
          <ApiKeysCard />
        </Stack>
      </Container>
    </Box>
  );
}
