import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  TextInput,
  PasswordInput,
  Button,
  Paper,
  Title,
  Text,
  Stack,
  Alert,
  Box,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconLanguage, IconAlertCircle, IconClockExclamation } from '@tabler/icons-react';
import { login, checkSetupStatus } from '@/api/auth';
import { useAuth } from '@/hooks/useAuth';
import { validateEmail } from '@/utils/validation';
import { getApiErrorMessage } from '@/utils/errors';

export default function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [expiredBannerDismissed, setExpiredBannerDismissed] = useState(false);
  const showExpiredBanner = searchParams.get('expired') === '1' && !expiredBannerDismissed;

  const { data: setupStatus } = useQuery({
    queryKey: ['auth', 'setup-status'],
    queryFn: checkSetupStatus,
  });

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: validateEmail,
      password: (value) => (!value ? 'Password is required' : null),
    },
  });

  useEffect(() => {
    if (setupStatus?.needsSetup) {
      navigate('/setup', { replace: true });
    }
  }, [setupStatus, navigate]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleSubmit = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      await login(values.email.trim(), values.password);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      navigate('/');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || setupStatus?.needsSetup) {
    return null;
  }

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0D1014 0%, #12161c 100%)',
      }}
    >
      <Paper
        shadow="xl"
        p={40}
        radius="lg"
        style={{ width: '100%', maxWidth: 420 }}
      >
        <Stack align="center" gap={4} mb="xl">
          <IconLanguage size={44} color="var(--mantine-color-atlantis-5)" stroke={1.5} />
          <Title order={2} ta="center" fw={700}>
            Laiven
          </Title>
          <Text c="dimmed" size="xs" ta="center">
            v{__APP_VERSION__}
          </Text>
          <Text c="dimmed" size="sm" ta="center">
            Sign in to your account
          </Text>
        </Stack>

        {showExpiredBanner && (
          <Alert
            icon={<IconClockExclamation size={18} />}
            color="sunset"
            variant="light"
            mb="md"
            onClose={() => setExpiredBannerDismissed(true)}
            withCloseButton
          >
            Your session has expired. Please sign in again.
          </Alert>
        )}

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
              placeholder="you@example.com"
              autoComplete="email"
              data-autofocus
              autoFocus
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Password"
              placeholder="Your password"
              autoComplete="current-password"
              {...form.getInputProps('password')}
            />
            <Button
              type="submit"
              fullWidth
              loading={loading}
              mt="xs"
              size="md"
            >
              Sign in
            </Button>
            <Text c="dimmed" size="xs" ta="center">
              Forgot password? Contact your instance administrator.
            </Text>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
