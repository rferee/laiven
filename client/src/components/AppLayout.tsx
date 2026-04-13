import { useState } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AppShell,
  Group,
  Text,
  Title,
  NavLink,
  UnstyledButton,
  Menu,
  Avatar,
  Divider,
  Breadcrumbs,
  Anchor,
  Loader,
  Center,
  Box,
  Collapse,
  Flex,
  Burger,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconSearch,
  IconSettings,
  IconChevronDown,
  IconUser,
  IconUsers,
  IconLogout,
  IconLayoutDashboard,
  IconLanguage,
  IconAdjustments,
  IconList,
  IconBinaryTree2,
  IconTransform,
  IconChevronRight,
  IconRuler,
  IconAbc,
  IconBooks,
} from '@tabler/icons-react';
import { getProject } from '@/api/projects';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

const configItems: NavItem[] = [
  { label: 'Attributes', icon: <IconAdjustments size={18} />, path: 'attributes' },
  { label: 'Variables', icon: <IconList size={18} />, path: 'variables' },
  { label: 'Builders', icon: <IconBinaryTree2 size={18} />, path: 'builders' },
  { label: 'Derivatives', icon: <IconTransform size={18} />, path: 'derivative-types' },
];

const rulesItems: NavItem[] = [
  { label: 'Word Rules', icon: <IconAbc size={18} />, path: 'rules/word' },
  { label: 'Derivative Rules', icon: <IconTransform size={18} />, path: 'rules/derivatives' },
  { label: 'Rules Library', icon: <IconBooks size={18} />, path: 'rules/library' },
];

export default function AppLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [configOpen, setConfigOpen] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(true);
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  });

  const logoutMutation = useLogout();

  const basePath = `/projects/${projectId}`;

  function isActive(path: string) {
    const fullPath = `${basePath}/${path}`;
    return location.pathname === fullPath || location.pathname.startsWith(`${fullPath}/`);
  }

  function isWordsActive() {
    return (
      location.pathname === basePath ||
      location.pathname === `${basePath}/` ||
      location.pathname.startsWith(`${basePath}/words`)
    );
  }

  function isConfigActive() {
    return configItems.some((item) => isActive(item.path));
  }

  function isRulesActive() {
    return rulesItems.some((item) => isActive(item.path));
  }

  function isSettingsActive() {
    return isActive('settings');
  }

  // Build breadcrumbs from the current path
  function getBreadcrumbs() {
    const crumbs: { label: string; href?: string }[] = [];
    crumbs.push({ label: project?.name ?? 'Project', href: basePath });

    const relativePath = location.pathname.replace(basePath, '').replace(/^\//, '');
    const segments = relativePath.split('/').filter(Boolean);

    if (segments.length === 0 || segments[0] === 'words') {
      crumbs.push({ label: 'Words' });
    } else if (segments[0] === 'settings') {
      crumbs.push({ label: 'Settings' });
    } else if (segments[0] === 'rules') {
      const sub = segments[1];
      const rulesItem = rulesItems.find((item) => item.path === `rules/${sub}`);
      crumbs.push({ label: 'Rules', href: `${basePath}/rules/library` });
      if (rulesItem) {
        crumbs.push({ label: rulesItem.label });
      }
    } else {
      const configItem = configItems.find((item) => item.path === segments[0]);
      if (configItem) {
        crumbs.push({ label: 'Configuration', href: `${basePath}/attributes` });
        crumbs.push({ label: configItem.label });
      }
    }

    return crumbs;
  }

  if (projectLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (!project) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Project not found.</Text>
      </Center>
    );
  }

  const breadcrumbs = getBreadcrumbs();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding="lg"
      // Force the header and navbar to stay pinned regardless of parent
      // overflow. Without this Mantine's default `position: sticky` can
      // behave inconsistently on long pages, letting the nav scroll away.
      styles={{
        header: { position: 'fixed' },
        navbar: { position: 'fixed' },
      }}
    >
      {/* Header */}
      <AppShell.Header>
        <Flex h="100%" px="md" align="center" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={mobileOpened}
              onClick={toggleMobile}
              hiddenFrom="sm"
              size="sm"
            />
            <Burger
              opened={desktopOpened}
              onClick={toggleDesktop}
              visibleFrom="sm"
              size="sm"
            />
            <UnstyledButton onClick={() => navigate('/')}>
              <Group gap={6} align="baseline">
                <IconLanguage
                  size={24}
                  stroke={1.5}
                  color="var(--mantine-color-atlantis-5)"
                />
                <Title order={4} fw={700} visibleFrom="sm">
                  Laiven
                </Title>
                <Text size="xs" c="dimmed" visibleFrom="sm">
                  v{__APP_VERSION__}
                </Text>
              </Group>
            </UnstyledButton>
            <Divider orientation="vertical" mx={4} />
            <Breadcrumbs
              separatorMargin={6}
              style={{ flexWrap: 'nowrap', overflow: 'hidden' }}
            >
              {breadcrumbs.map((crumb, i) =>
                crumb.href && i < breadcrumbs.length - 1 ? (
                  <Anchor
                    key={i}
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(crumb.href!);
                    }}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {crumb.label}
                  </Anchor>
                ) : (
                  <Text key={i} size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>
                    {crumb.label}
                  </Text>
                ),
              )}
            </Breadcrumbs>
          </Group>

          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar size="sm" radius="xl" color="atlantis">
                    {user?.displayName?.charAt(0).toUpperCase() ?? 'U'}
                  </Avatar>
                  <Text size="sm" fw={500} visibleFrom="sm">
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
              <Menu.Item
                leftSection={<IconUser size={14} />}
                onClick={() => navigate('/profile')}
              >
                Profile
              </Menu.Item>
              {user?.role === 'instance_admin' && (
                <Menu.Item
                  leftSection={<IconUsers size={14} />}
                  onClick={() => navigate('/users')}
                >
                  User Management
                </Menu.Item>
              )}
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
      </AppShell.Header>

      {/* Sidebar */}
      <AppShell.Navbar p="sm">
        <AppShell.Section grow>
          <Box mb={4}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={8} px={8}>
              Navigation
            </Text>
          </Box>

          <NavLink
            label="Words"
            leftSection={<IconSearch size={18} />}
            active={isWordsActive()}
            onClick={() => navigate(basePath)}
            variant="light"
            mb={4}
          />

          <NavLink
            label="Configuration"
            leftSection={<IconAdjustments size={18} />}
            rightSection={
              <IconChevronRight
                size={14}
                style={{
                  transform: configOpen ? 'rotate(90deg)' : 'none',
                  transition: 'transform 150ms ease',
                }}
              />
            }
            active={isConfigActive()}
            onClick={() => setConfigOpen((o) => !o)}
            variant="light"
            mb={2}
          />
          <Collapse in={configOpen}>
            <Box pl="md">
              {configItems.map((item) => (
                <NavLink
                  key={item.path}
                  label={item.label}
                  leftSection={item.icon}
                  active={isActive(item.path)}
                  onClick={() => navigate(`${basePath}/${item.path}`)}
                  variant="light"
                  mb={2}
                />
              ))}
            </Box>
          </Collapse>

          <NavLink
            label="Rules"
            leftSection={<IconRuler size={18} />}
            rightSection={
              <IconChevronRight
                size={14}
                style={{
                  transform: rulesOpen ? 'rotate(90deg)' : 'none',
                  transition: 'transform 150ms ease',
                }}
              />
            }
            active={isRulesActive()}
            onClick={() => setRulesOpen((o) => !o)}
            variant="light"
            mb={2}
          />
          <Collapse in={rulesOpen}>
            <Box pl="md">
              {rulesItems.map((item) => (
                <NavLink
                  key={item.path}
                  label={item.label}
                  leftSection={item.icon}
                  active={isActive(item.path)}
                  onClick={() => navigate(`${basePath}/${item.path}`)}
                  variant="light"
                  mb={2}
                />
              ))}
            </Box>
          </Collapse>

          <Divider my="sm" />

          <NavLink
            label="Settings"
            leftSection={<IconSettings size={18} />}
            active={isSettingsActive()}
            onClick={() => navigate(`${basePath}/settings`)}
            variant="light"
          />
        </AppShell.Section>

        <AppShell.Section>
          <Divider mb="sm" />
          <Text size="xs" c="dimmed" ta="center" pb="xs">
            {project.name}
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* Content */}
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
