declare module "@tabler/icons-react" {
  import { FC, SVGProps } from "react";
  export interface TablerIconProps extends SVGProps<SVGSVGElement> {
    size?: number | string;
    stroke?: number | string;
    color?: string;
  }
  export type TablerIcon = FC<TablerIconProps>;
  export const IconBallTennis: TablerIcon;
  export const IconTrophy: TablerIcon;
  export const IconCalendarEvent: TablerIcon;
  export const IconBuildingBank: TablerIcon;
}
