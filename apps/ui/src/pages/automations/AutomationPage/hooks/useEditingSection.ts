import { useSearchParams } from "react-router";

const EDITING_PARAM = "editing";

export function useEditingSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const editingSection = searchParams.get(EDITING_PARAM);

  const setEditingSection = (value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) {
        next.delete(EDITING_PARAM);
      } else {
        next.set(EDITING_PARAM, value);
      }
      return next;
    });
  };

  return { editingSection, setEditingSection };
}
