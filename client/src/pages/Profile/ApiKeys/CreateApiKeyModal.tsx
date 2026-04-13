import { Alert, Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconAlertCircle } from '@tabler/icons-react';
import { createApiKey, type ApiKeyCreateResponse } from '@/api/auth';
import { getProjects } from '@/api/projects';
import { getApiErrorMessage } from '@/utils/errors';

interface CreateApiKeyModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: (key: ApiKeyCreateResponse) => void;
}

type Role = 'viewer' | 'editor' | 'project_admin';

interface FormValues {
  name: string;
  projectId: string | null;
  role: Role | null;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'project_admin', label: 'Project admin' },
];

export default function CreateApiKeyModal({ opened, onClose, onCreated }: CreateApiKeyModalProps) {
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });
  const projects = projectsData?.items ?? [];

  const form = useForm<FormValues>({
    initialValues: { name: '', projectId: null, role: null },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Name is required' : null),
      role: (value, values) =>
        values.projectId && !value ? 'Role is required when a project is selected' : null,
      projectId: (value, values) =>
        !value && values.role ? 'Project is required when a role is selected' : null,
    },
  });

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof createApiKey>[0]) => createApiKey(data),
    onSuccess: (key) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      onCreated(key);
      form.reset();
      onClose();
    },
  });

  function handleSubmit(values: FormValues) {
    mutation.mutate({
      name: values.name.trim(),
      ...(values.projectId && values.role
        ? { projectId: values.projectId, role: values.role }
        : {}),
    });
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Create API key" size="md" centered>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          {mutation.isError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
              {getApiErrorMessage(mutation.error, 'Failed to create API key.')}
            </Alert>
          )}

          <TextInput
            label="Name"
            placeholder="e.g. CI pipeline"
            withAsterisk
            {...form.getInputProps('name')}
          />

          <Select
            label="Project (optional)"
            placeholder="Leave blank for full access"
            clearable
            data={projects.map((p) => ({ value: p.id, label: p.name }))}
            {...form.getInputProps('projectId')}
            onChange={(v) => {
              form.setFieldValue('projectId', v);
              if (!v) form.setFieldValue('role', null);
            }}
          />

          <Select
            label="Role"
            placeholder={form.values.projectId ? 'Choose a role' : 'Pick a project first'}
            disabled={!form.values.projectId}
            data={ROLE_OPTIONS}
            {...form.getInputProps('role')}
          />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>Create</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
