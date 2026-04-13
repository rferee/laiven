import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { IconLanguage, IconAlertCircle, IconSparkles } from '@tabler/icons-react';
import { setup, checkSetupStatus } from '@/api/auth';
import { validateEmail, validatePassword, validateConfirmPassword } from '@/utils/validation';
import { getApiErrorMessage } from '@/utils/errors';

export default function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: setupStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['auth', 'setup-status'],
    queryFn: checkSetupStatus,
  });

  const form = useForm({
    initialValues: {
      email: '',
      displayName: '',
      password: '',
      confirmPassword: '',
    },
    validate: {
      email: validateEmail,
      displayName: (value) =>
        !value.trim() ? 'Display name is required' : null,
      password: validatePassword,
      confirmPassword: (value, values) => validateConfirmPassword(values.password)(value),
    },
  });

  useEffect(() => {
    if (!statusLoading && setupStatus && !setupStatus.needsSetup) {
      navigate('/login', { replace: true });
    }
  }, [setupStatus, statusLoading, navigate]);

  const handleSubmit = async (values: {
    email: string;
    displayName: string;
    password: string;
    confirmPassword: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      await setup({
        email: values.email,
        displayName: values.displayName,
        password: values.password,
      });
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      navigate('/');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Setup failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (statusLoading || (setupStatus && !setupStatus.needsSetup)) {
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
        style={{ width: '100%', maxWidth: 460 }}
      >
        <Stack align="center" gap={4} mb="lg">
          <IconLanguage size={44} color="var(--mantine-color-atlantis-5)" stroke={1.5} />
          <Title order={2} ta="center" fw={700}>
            Welcome to Laiven
          </Title>
        </Stack>

        <Alert
          icon={<IconSparkles size={18} />}
          color="atlantis"
          variant="light"
          mb="lg"
        >
          <Text size="sm">
            This is the first-time setup. Create your administrator account to get started.
          </Text>
        </Alert>

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

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label="Email"
              placeholder="admin@example.com"
              autoComplete="email"
              autoFocus
              withAsterisk
              {...form.getInputProps('email')}
            />
            <TextInput
              label="Display Name"
              placeholder="Your name"
              autoComplete="name"
              withAsterisk
              {...form.getInputProps('displayName')}
            />
            <PasswordInput
              label="Password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              withAsterisk
              {...form.getInputProps('password')}
            />
            <PasswordInput
              label="Confirm Password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              withAsterisk
              {...form.getInputProps('confirmPassword')}
            />
            <Button
              type="submit"
              fullWidth
              loading={loading}
              mt="xs"
              size="md"
            >
              Create Admin Account
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
