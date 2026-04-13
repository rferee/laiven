import { Stack, Skeleton } from '@mantine/core';

interface SkeletonListProps {
  rows?: number;
  height?: number | string;
}

export default function SkeletonList({ rows = 3, height = 52 }: SkeletonListProps) {
  return (
    <Stack gap="sm">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius="md" />
      ))}
    </Stack>
  );
}
