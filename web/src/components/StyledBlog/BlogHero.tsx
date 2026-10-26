interface Props {
  title: string;
  description?: string;
}

/** The site title over the feed in the styled Blog 2 layout; each style dresses it its own way. */
const BlogHero = ({ title, description }: Props) => (
  <header data-sb-hero="" className="mb-6 min-w-0">
    <h1 data-sb-hero-title="" className="text-[1.875rem] font-bold leading-tight text-foreground">{title}</h1>
    {description && <p data-sb-hero-desc="" className="mt-2 text-sm text-muted-foreground">{description}</p>}
  </header>
);

export default BlogHero;
