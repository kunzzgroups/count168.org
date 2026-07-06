import { useEffect, useState } from "react";
import "./DevPhoneFrame.css";

const DEV_FRAME_KEY = "c168_mobile_dev_phone_frame";

const DEVICES = [
  { id: "iphone-14", label: "iPhone 14", width: 390, height: 844 },
  { id: "iphone-se", label: "iPhone SE", width: 375, height: 667 },
  { id: "pixel-7", label: "Pixel 7", width: 412, height: 915 },
];

function readFrameEnabled() {
  try {
    return sessionStorage.getItem(DEV_FRAME_KEY) !== "off";
  } catch {
    return true;
  }
}

export default function DevPhoneFrame({ children }) {
  const [enabled, setEnabled] = useState(readFrameEnabled);
  const [deviceId, setDeviceId] = useState("iphone-14");

  const device = DEVICES.find((d) => d.id === deviceId) || DEVICES[0];

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;

    if (enabled) {
      document.body.classList.add("dev-phone-lab");
    } else {
      document.body.classList.remove("dev-phone-lab");
    }

    return () => {
      document.body.classList.remove("dev-phone-lab");
    };
  }, [enabled]);

  if (!import.meta.env.DEV || !enabled) {
    return (
      <>
        {children}
        {import.meta.env.DEV && (
          <button
            type="button"
            className="dev-phone-fab"
            onClick={() => {
              sessionStorage.setItem(DEV_FRAME_KEY, "on");
              setEnabled(true);
            }}
            title="打开手机模拟器"
          >
            <i className="fas fa-mobile-screen-button" aria-hidden="true" />
          </button>
        )}
      </>
    );
  }

  return (
    <div className="dev-phone-stage">
      <div className="dev-phone-toolbar">
        <span className="dev-phone-toolbar__label">开发预览</span>
        <select
          className="dev-phone-toolbar__select"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          aria-label="选择设备尺寸"
        >
          {DEVICES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} ({d.width}×{d.height})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="dev-phone-toolbar__btn"
          onClick={() => {
            sessionStorage.setItem(DEV_FRAME_KEY, "off");
            setEnabled(false);
          }}
        >
          全屏
        </button>
      </div>

      <div
        className="dev-phone-device"
        style={{
          "--dev-phone-width": `${device.width}px`,
          "--dev-phone-height": `${device.height}px`,
        }}
      >
        <div className="dev-phone-bezel">
          <div className="dev-phone-notch" aria-hidden="true" />
          <div className="dev-phone-screen">
            <div className="dev-phone-screen__scroll">{children}</div>
          </div>
          <div className="dev-phone-home-bar" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
