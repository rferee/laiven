import { Flex, Group, Box, UnstyledButton, Title, Text, Menu, Avatar, Divider } from '@mantine/core';
import {
  IconLanguage, IconChevronDown, IconUser, IconUsers, IconLogout, IconLayoutDashboard,
} from '@tabler/icons-react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';

interface TopBarProps {
  /** Variant controls whether an outer `<Box component="header">` with border is rendered (standalone)
   *  or just the inner `<Flex>` (when host is an AppShell.Header that already provides chrome). */
  variant?: 'standalone' | 'appshell';
  /** Left-side slot rendered before the brand. Used for burgers on project pages. */
  leading?: ReactNode;
  /** Optional breadcrumbs slot rendered after the brand, separated by a vertical Divider. */
  breadcrumbs?: ReactNode;
}

export default function TopBar({ variant = 'standalone', leading, breadcrumbs }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const logoutMutation = useLogout();

  const isOn = (path: string) => location.pathname === path;
  const isAdmin = user?.role === 'instance_admin';

  const content = (
    <Flex h="100%" px="md" align="center" justify="space-between">
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        {leading}
        <UnstyledButton onClick={() => navigate('/')}>
          <Group gap={6} align="baseline">
            <IconLanguage size={24} stroke={1.5} color="var(--mantine-color-atlantis-5)" />
            <Title order={4} fw={700} visibleFrom="sm">Laiven</Title>
            <Text size="xs" c="dimmed" visibleFrom="sm">v{__APP_VERSION__}</Text>
          </Group>
        </UnstyledButton>
        {breadcrumbs && (
          <>
            <Divider orientation="vertical" mx={4} />
            {breadcrumbs}
          </>
        )}
      </Group>

      <Menu position="bottom-end" shadow="md" width={200}>
        <Menu.Target>
          <UnstyledButton>
            <Group gap="xs" wrap="nowrap">
              <Avatar color="atlantis" radius="xl" size={32}>
                {user?.displayName?.[0]?.toUpperCase() ?? '?'}
              </Avatar>
              <Text size="sm" fw={500} visibleFrom="sm">{user?.displayName}</Text>
              <IconChevronDown size={14} />
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {!isOn('/') && (
            <Menu.Item leftSection={<IconLayoutDashboard size={16} />} onClick={() => navigate('/')}>Dashboard</Menu.Item>
          )}
          {!isOn('/profile') && (
            <Menu.Item leftSection={<IconUser size={16} />} onClick={() => navigate('/profile')}>Profile</Menu.Item>
          )}
          {isAdmin && !isOn('/users') && (
            <Menu.Item leftSection={<IconUsers size={16} />} onClick={() => navigate('/users')}>Users</Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={() => logoutMutation.mutate()}>Logout</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Flex>
  );

  if (variant === 'appshell') return content;

  return (
    <Box component="header" py="sm" px="lg" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      {content}
    </Box>
  );
}
