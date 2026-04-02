import { useEffect } from "react";
import { router } from "expo-router";

interface Props {
  visible: boolean;
  url: string;
  title?: string;
  onClose: () => void;
}

export default function PdfViewerModal({ visible, url, title = "Report", onClose }: Props) {
  useEffect(() => {
    if (!visible || !url) return;
    router.push({
      pathname: "/inspection/document-viewer" as any,
      params: {
        url,
        name: title,
        mimeType: "application/pdf",
      },
    });
    onClose();
  }, [visible, url]);

  return null;
}
