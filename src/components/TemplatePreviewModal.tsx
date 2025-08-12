// src/components/TemplatePreviewModal.tsx
interface TemplatePreviewModalProps {
  template: {
    id: number;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    workflowJson: any;
    _tags: string[];
    createdAt: string;
    purchased: boolean;
    hasAccess: boolean;
  };
  isOpen: boolean;
  onClose: () => void;
  onPurchase: () => void;
  onDownload: () => void;
}

export const TemplatePreviewModal = (props: TemplatePreviewModalProps) => {
  return (
    <div>
      <h2>{props.template.name}</h2>
      <p>{props.template.description}</p>
      {/* Add your modal implementation */}
    </div>
  );
};
