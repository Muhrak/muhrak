/** Auth screens use the light design from Figma, inside the otherwise dark app. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <div className="light flex-1 bg-canvas text-ink">{children}</div>;
}
