import { AppearanceForm } from "@/components/settings/appearance-form";
import styles from "@/components/portal/portal.module.css";
import type { Appearance } from "@/lib/appearance";

/**
 * D84: "Giao diện" on the worker's "Tôi" and the customer's "Tài khoản" — light, dark or the phone's setting, and the text
 * size. It is the office's form and cookie, so one choice covers every portal (and the office) on this device.
 */
export function PortalAppearance({ initial }: { initial: Appearance }) {
  return (
    <section className={styles.card} aria-labelledby="portal-appearance-title">
      <h2 id="portal-appearance-title">Giao diện</h2>
      <AppearanceForm initial={initial} choices={["theme", "skin", "fontSize"]}
        classes={{ root: styles.appearance, group: styles.choiceGroup, options: styles.choiceTrack }} />
    </section>
  );
}
