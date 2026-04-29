import { useState } from "react";
import { useLanguage, type Language } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Languages, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export const LanguageToggle: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleSelect = (lang: Language) => {
    setLanguage(lang);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("transition-transform duration-300")}
        >
          <Languages className={cn("h-5 w-5 transition-transform duration-200")} />
          <span className="sr-only">{t("language.language")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t("language.language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleSelect("en")}
          className="flex items-center gap-2"
        >
          <span className="flex-1">{t("language.english")}</span>
          {language === "en" && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleSelect("zh")}
          className="flex items-center gap-2"
        >
          <span className="flex-1">{t("language.chinese")}</span>
          {language === "zh" && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
