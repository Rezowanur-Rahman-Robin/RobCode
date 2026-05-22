import { useTheme } from "../providers/theme";

export function Header() {

    const { colors } = useTheme();
  
  return (
    <box justifyContent="center" alignItems="center">
      <box flexDirection="row" justifyContent="center" gap={0.5} alignItems="center">
        <ascii-font font="block" text="Rob" color="white" />
        <ascii-font font="block" text="Code" color={colors.primary} />
      </box>
    </box>
  );
};
