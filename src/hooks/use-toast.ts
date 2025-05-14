import { toast } from "sonner"
import type { ToastT } from "sonner"

export function useToast() {
  function toastWithType(
    message: string,
    type: ToastT["type"] = "default"
  ) {
    switch (type) {
      case "success":
        return toast.success(message)
      case "error":
        return toast.error(message)
      case "warning":
        return toast.warning(message)
      case "info":
        return toast.info(message)
      default:
        return toast(message)
    }
  }

  return {
    toast: toastWithType,
    dismiss: toast.dismiss,
  }
}