import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface PaginationProps {
  currentPage: number;
  pageCount: number;
  perPage: number;
  totalCount: number;
  onPageChange: (selectedItem: { selected: number }) => void;
  showingResults?: boolean;
}

export default function Pagination({
  currentPage,
  pageCount,
  perPage,
  totalCount,
  onPageChange,
  showingResults = true,
}: PaginationProps) {
  // Calculate what results we're showing
  const start = totalCount === 0 ? 0 : currentPage * perPage + 1;
  const end = Math.min((currentPage + 1) * perPage, totalCount);

  const handlePageChange = (page: number) => {
    // Call the original onPageChange handler
    onPageChange({ selected: page });

    // Scroll to top smoothly
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    const showEllipsis = pageCount > 7;

    if (!showEllipsis) {
      // Show all pages if 7 or fewer
      for (let i = 0; i < pageCount; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(0);

      if (currentPage <= 3) {
        // Near the beginning
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push("ellipsis");
        pages.push(pageCount - 1);
      } else if (currentPage >= pageCount - 4) {
        // Near the end
        pages.push("ellipsis");
        for (let i = pageCount - 5; i < pageCount - 1; i++) {
          pages.push(i);
        }
        pages.push(pageCount - 1);
      } else {
        // In the middle
        pages.push("ellipsis");
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push("ellipsis");
        pages.push(pageCount - 1);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
      {showingResults && (
        <div className="w-full text-sm text-muted-foreground">
          Mostrando {start}-{end} de {totalCount} resultados
        </div>
      )}

      {pageCount > 1 && (
        <PaginationRoot>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                size="default"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 0) {
                    handlePageChange(currentPage - 1);
                  }
                }}
                className={
                  currentPage === 0
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer"
                }
              />
            </PaginationItem>

            {pageNumbers.map((page, index) => (
              <PaginationItem
                key={page === "ellipsis" ? `ellipsis-${index}` : `page-${page}`}
              >
                {page === "ellipsis" ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href="#"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      handlePageChange(page);
                    }}
                    isActive={currentPage === page}
                    className="cursor-pointer"
                  >
                    {page + 1}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                href="#"
                size="default"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage < pageCount - 1) {
                    handlePageChange(currentPage + 1);
                  }
                }}
                className={
                  currentPage === pageCount - 1
                    ? "pointer-events-none opacity-50"
                    : "cursor-pointer"
                }
              />
            </PaginationItem>
          </PaginationContent>
        </PaginationRoot>
      )}
    </div>
  );
}
