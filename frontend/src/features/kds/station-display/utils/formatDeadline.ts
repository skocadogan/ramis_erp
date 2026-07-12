export function formatDeadline(deadline: string | null): {
  label: string;
  isOverdue: boolean;
  isUrgent: boolean;
} {
  if (!deadline) return { label: "", isOverdue: false, isUrgent: false };
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl.getTime() - now.getTime();
  const isOverdue = diff < 0;
  const isUrgent = !isOverdue && diff < 60 * 60 * 1000; // < 1 saat

  if (isOverdue) {
    const mins = Math.abs(Math.floor(diff / 60000));
    if (mins < 60) return { label: `${mins}dk gecikti`, isOverdue: true, isUrgent: false };
    const hrs = Math.floor(mins / 60);
    return { label: `${hrs}sa ${mins % 60}dk gecikti`, isOverdue: true, isUrgent: false };
  }

  const mins = Math.floor(diff / 60000);
  if (mins < 60) return { label: `${mins}dk kaldı`, isOverdue: false, isUrgent };
  const hrs = Math.floor(mins / 60);
  return { label: `${hrs}sa ${mins % 60}dk kaldı`, isOverdue: false, isUrgent };
}
