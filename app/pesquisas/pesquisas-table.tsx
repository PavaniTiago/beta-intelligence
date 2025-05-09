'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowUpDown, ChevronDown, ChevronUp, DownloadIcon, Loader2, RefreshCw, Calendar, X, Check, Filter, ChevronRight } from "lucide-react"
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Pagination } from "@/components/pagination"
import { Checkbox } from "@/components/ui/checkbox"
import { DateFilter } from "../events/date-filter" 
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

/**
 * Interface para o tipo Pesquisa (survey)
 */
export interface Pesquisa {
  id: string
  survey_id?: string // ID original da API
  nome: string // Nome da Pesquisa
  profissao: string // Profissão
  funil: string // Funil
  taxa_resposta: number // Taxa de Resposta (%)
  conversao_vendas: number // Conversão em Vendas (%)
  created_at: string
}

/**
 * Interface para os metadados da paginação
 */
export interface Meta {
  total: number
  page: number
  limit: number
  last_page: number
  profession_id?: number
  funnel_id?: number
}

/**
 * Props para o componente PesquisasTable
 */
export interface PesquisasTableProps {
  pesquisas: Pesquisa[]
  isLoading: boolean
  meta?: Meta
  error?: any
  searchParams: string
  currentPage: number
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc' | string | null
  onSort: (column: string, direction: 'asc' | 'desc') => void
  onPageChange: (page: number) => void
  onRefresh?: () => void
  onExport?: (selectedPesquisas: Pesquisa[]) => void
}

/**
 * Interface para as colunas da tabela
 */
export interface Column {
  id: string
  accessorKey: string
  header: string
  cell?: (value: any, row: any) => React.ReactNode
}

/**
 * Tipos de filtro
 */
type FilterType = 'captacao' | 'pesquisa' | 'vendas';

/**
 * Interface para armazenar datas por tipo de filtro
 */
interface FilterDateRange {
  from?: Date;
  to?: Date;
  fromTime?: string;
  toTime?: string;
}

/**
 * Componente de cabeçalho ordenável para a tabela
 */
function SortableHeader({ 
  column,
  sortColumn,
  sortDirection,
  onSort
}: {
  column: Column
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc' | null | string
  onSort: (columnId: string, direction: 'asc' | 'desc') => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.accessorKey });

  const isCurrentSortColumn = sortColumn === column.accessorKey;
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : undefined,
  }

  // Estado para largura da coluna
  const [width, setWidth] = useState('140px');
  const [resizing, setResizing] = useState(false);
  
  // Prevenir conflito entre ordenamento e arraste
  const handleSortClick = (e: React.MouseEvent) => {
    if (resizing) return; // Não ordenar durante redimensionamento
    e.stopPropagation(); // Impedir que o arraste seja acionado junto com a ordenação
    onSort(column.accessorKey, isCurrentSortColumn && sortDirection === 'asc' ? 'desc' : 'asc');
  };

  return (
    <th
      ref={setNodeRef}
      style={{
        ...style,
        width: width,
        minWidth: width,
        position: 'relative',
        userSelect: 'none'
      }}
      className={`group relative px-3 py-3.5 text-left text-sm font-semibold text-gray-900 ${isDragging ? 'opacity-50' : ''} ${resizing ? 'cursor-col-resize' : ''}`}
    >
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={handleSortClick}
        {...attributes}
        {...listeners}
      >
        <span>{column.header}</span>
        <div className="flex">
          {isCurrentSortColumn && (
            sortDirection === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )
          )}
          {!isCurrentSortColumn && (
            <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-100" />
          )}
        </div>
      </div>
    </th>
  );
}

/**
 * Componente principal da tabela de pesquisas
 */
export function PesquisasTable({
  pesquisas,
  isLoading,
  meta,
  searchParams,
  currentPage,
  sortColumn,
  sortDirection,
  onSort,
  onPageChange,
  onRefresh,
  onExport
}: PesquisasTableProps) {
  // Adicionar estado para controlar se o componente está montado no cliente
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Marcar componente como montado apenas no lado do cliente
    setIsMounted(true);
  }, []);

  const router = useRouter();
  const searchParamsObj = useSearchParams();
  
  // Estado para os itens selecionados
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  
  // Estado para filtros ativos e suas datas
  const [activeFilters, setActiveFilters] = useState<{
    captacao?: FilterDateRange;
    pesquisa?: FilterDateRange;
    vendas?: FilterDateRange;
  }>({});
  
  // Estado para filtro aberto atualmente
  const [currentEditingFilter, setCurrentEditingFilter] = useState<FilterType | null>(null);
  
  // Estado temporário para filtro sendo editado
  const [tempDateRange, setTempDateRange] = useState<FilterDateRange | undefined>();
  
  // Estado para dropdowns
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  
  // Estado para controlar atualizações diretas pelo componente
  const [isUpdatingDirectly, setIsUpdatingDirectly] = useState(false);
  
  // Inicializar filtros com valores da URL
  useEffect(() => {
    if (isUpdatingDirectly) return;
    
    const newActiveFilters: typeof activeFilters = {};
    
    // Buscar parâmetros para cada tipo de filtro
    ['captacao', 'pesquisa', 'vendas'].forEach((filterType) => {
      const fromKey = `${filterType}_from`;
      const toKey = `${filterType}_to`;
      const timeFromKey = `${filterType}_time_from`;
      const timeToKey = `${filterType}_time_to`;
      
      const from = searchParamsObj.get(fromKey);
      const to = searchParamsObj.get(toKey);
      const timeFrom = searchParamsObj.get(timeFromKey);
      const timeTo = searchParamsObj.get(timeToKey);
      
      if (from) {
        newActiveFilters[filterType as FilterType] = {
          from: new Date(from),
          to: to ? new Date(to) : undefined,
          fromTime: timeFrom || undefined,
          toTime: timeTo || undefined
        };
      }
    });
    
    setActiveFilters(newActiveFilters);
  }, [searchParamsObj, isUpdatingDirectly]);
  
  // Sensores para o DnD
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Definição das colunas
  const [columns, setColumns] = useState<Column[]>([
    {
      id: "nome",
      accessorKey: "nome",
      header: "Nome da Pesquisa",
      cell: (value: any) => <div className="font-medium">{value}</div>
    },
    {
      id: "profissao",
      accessorKey: "profissao",
      header: "Profissão"
    },
    {
      id: "funil",
      accessorKey: "funil",
      header: "Funil"
    },
    {
      id: "taxa_resposta",
      accessorKey: "taxa_resposta",
      header: "Taxa de Resposta",
      cell: (value: number) => <div>{value.toFixed(2)}%</div>
    },
    {
      id: "conversao_vendas",
      accessorKey: "conversao_vendas",
      header: "Conversão em Vendas",
      cell: (value: number) => <div>{value.toFixed(2)}%</div>
    }
  ]);
  
  // Resetar seleção quando mudar os dados
  useEffect(() => {
    setSelectedItems([]);
  }, [pesquisas]);
  
  // Atualizar URL com filtros
  const updateUrl = useCallback((newParams: URLSearchParams) => {
    const url = `${window.location.pathname}?${newParams.toString()}`;
    router.push(url);
  }, [router]);
  
  // Handler para reordenação das colunas
  const handleDragEnd = (result: DragEndEvent) => {
    const { active, over } = result;
    
    if (!over) return;
    
    if (active.id !== over.id) {
      setColumns((columns) => {
        const oldIndex = columns.findIndex((col) => col.accessorKey === active.id);
        const newIndex = columns.findIndex((col) => col.accessorKey === over.id);
        
        return arrayMove(columns, oldIndex, newIndex);
      });
    }
  };
  
  // Handler para seleção de linhas
  const toggleRowSelection = (id: string) => {
    setSelectedItems((prev) => 
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };
  
  // Handler para selecionar todas as linhas
  const toggleSelectAll = () => {
    if (selectedItems.length === pesquisas.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(pesquisas.map((item) => item.id));
    }
  };
  
  // Handler para atualização de filtros de data
  const handleDateChange = useCallback((date: FilterDateRange) => {
    if (!currentEditingFilter) return;
    
    setTempDateRange(date);
  }, [currentEditingFilter]);
  
  // Handler para abrir modal de data para um tipo específico
  const openDateFilterForType = useCallback((type: FilterType) => {
    setCurrentEditingFilter(type);
    setTempDateRange(activeFilters[type] || undefined);
  }, [activeFilters]);
  
  // Adicionar função de formatação de data com timezone de Brasília
  const formatDateWithBrasiliaTimezone = (date: Date): string => {
    if (!date) return ''; // Retornar string vazia em vez de undefined
    const isoDate = date.toISOString();
    return isoDate.replace('Z', '-03:00');
  };
  
  // Handler para aplicar o filtro de data temporário
  const applyCurrentFilter = useCallback(() => {
    if (!currentEditingFilter) return;
    
    setActiveFilters(prev => ({
      ...prev,
      [currentEditingFilter]: tempDateRange
    }));
    
    // Atualizar URL com os novos filtros
    const newParams = new URLSearchParams(searchParamsObj.toString());
    
    // Resetar para a primeira página ao mudar filtros
    newParams.set('page', '1');
    
    // Atualizar filtros para o tipo atual com formato correto para a API
    if (tempDateRange?.from) {
      // Usar formato ISO8601 com timezone de Brasília
      const formattedDate = formatDateWithBrasiliaTimezone(tempDateRange.from);
      newParams.set(`${currentEditingFilter}_from`, formattedDate);
    } else {
      newParams.delete(`${currentEditingFilter}_from`);
    }
    
    if (tempDateRange?.to) {
      // Usar formato ISO8601 com timezone de Brasília e configurar para final do dia
      const toDate = new Date(tempDateRange.to);
      toDate.setHours(23, 59, 59, 999);
      const formattedDate = formatDateWithBrasiliaTimezone(toDate);
      newParams.set(`${currentEditingFilter}_to`, formattedDate);
    } else {
      newParams.delete(`${currentEditingFilter}_to`);
    }
    
    // Remover os campos de time que não estamos mais usando na nova integração da API
    newParams.delete(`${currentEditingFilter}_time_from`);
    newParams.delete(`${currentEditingFilter}_time_to`);
    
    updateUrl(newParams);
    
    // Fechar modal após aplicar
    setCurrentEditingFilter(null);
    setTempDateRange(undefined);
  }, [currentEditingFilter, tempDateRange, searchParamsObj, updateUrl]);
  
  // Handler para remover um filtro específico
  const removeFilter = useCallback((type: FilterType) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[type];
      return newFilters;
    });
    
    // Atualizar URL removendo os parâmetros do filtro
    const newParams = new URLSearchParams(searchParamsObj.toString());
    
    // Remover todos os parâmetros relacionados a este filtro
    newParams.delete(`${type}_from`);
    newParams.delete(`${type}_to`);
    newParams.delete(`${type}_time_from`);
    newParams.delete(`${type}_time_to`);
    
    // Resetar para a primeira página
    newParams.set('page', '1');
    
    updateUrl(newParams);
  }, [searchParamsObj, updateUrl]);
  
  // Handler para limpar todos os filtros
  const handleClearFilters = useCallback(() => {
    setActiveFilters({});
    
    // Set updating flag to prevent recursive updates
    setIsUpdatingDirectly(true);
    
    try {
      // Create new URL params without filter parameters
      const params = new URLSearchParams();
      
      // Preserve pagination and sorting
      params.set('page', '1');
      if (sortColumn) params.set('sortBy', sortColumn);
      if (sortDirection) params.set('sortDirection', sortDirection as string);
      
      // Update URL
      router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
      
      setTimeout(() => {
        setIsUpdatingDirectly(false);
        if (onRefresh) onRefresh();
      }, 100);
    } catch (error) {
      console.error('Error clearing filters:', error);
      setIsUpdatingDirectly(false);
    }
  }, [router, sortColumn, sortDirection, onRefresh]);
  
  // Handler para exportar dados
  const handleExport = () => {
    if (onExport) {
      const selectedPesquisas = pesquisas.filter((pesquisa) => 
        selectedItems.includes(pesquisa.id)
      );
      onExport(selectedPesquisas);
    }
  };
  
  // Handler para exportar página atual
  const handleExportCurrentPage = () => {
    if (onExport) {
      onExport(pesquisas);
    }
  };
  
  // Verificar se há itens selecionados
  const hasSelectedItems = selectedItems.length > 0;
  
  // Verificar se há filtros ativos
  const hasActiveFilters = Object.keys(activeFilters).length > 0;
  
  // Obter o total de filtros ativos
  const getActiveFiltersCount = (): number => {
    return Object.keys(activeFilters).length;
  };
  
  // Formatação de data para exibição
  const formatDateForDisplay = (dateRange?: FilterDateRange): string => {
    if (!dateRange?.from) return '';
    
    let formattedDate = format(dateRange.from, "dd/MM/yy", { locale: ptBR });
    if (dateRange.to) {
      formattedDate += ` - ${format(dateRange.to, "dd/MM/yy", { locale: ptBR })}`;
    }
    
    return formattedDate;
  };
  
  // Tradução de tipos de filtro
  const filterTypeNames = {
    captacao: 'Captação',
    pesquisa: 'Pesquisa',
    vendas: 'Vendas'
  };
  
  // Atualizar função de paginação para preservar os filtros ativos
  const handlePageChange = useCallback((page: number) => {
    // Usar os parâmetros atuais da URL para preservar filtros
    const newParams = new URLSearchParams(searchParamsObj.toString());
    
    // Atualizar número da página
    newParams.set('page', String(page));
    
    // Atualizar URL com todos os filtros existentes
    updateUrl(newParams);
    
    // Chamar o callback original
    if (onPageChange) {
      onPageChange(page);
    }
  }, [searchParamsObj, updateUrl, onPageChange]);
  
  // Função para navegar para a página de detalhes da pesquisa
  const navigateToSurveyDetails = (id: string, survey_id?: string) => {
    // Sempre usar survey_id, que é o ID original da API
    // Se survey_id não existir, significa que o ID já é o survey_id
    const surveyId = survey_id || id;
    
    if (!surveyId) {
      console.error('Erro: Tentativa de navegação para pesquisa sem ID válido');
      return;
    }
    
    console.log(`Navegando para pesquisa: ${surveyId}`);
    router.push(`/pesquisas/${surveyId}`);
  };
  
  // Renderizar uma versão estática da tabela durante a hidratação no servidor
  if (!isMounted) {
    return (
      <div className="space-y-4">
        {/* Área de filtros */}
        <div className="flex flex-wrap gap-3 mb-4 items-center justify-between">
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
            >
              <Filter className="h-3.5 w-3.5 mr-2" />
              <span className="text-sm">Filtros</span>
              <ChevronDown className="h-3.5 w-3.5 ml-2" />
            </Button>
            
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={true}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                <span className="text-sm">Recarregar</span>
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex items-center gap-2"
              disabled={true}
            >
              <DownloadIcon className="h-4 w-4" />
              <span className="text-sm">Exportar</span>
            </Button>
          </div>
        </div>
        
        {/* Tabela de Pesquisas */}
        <div className="rounded-md border">
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="w-12 pl-4 pr-0 py-3.5">
                    <Checkbox
                      checked={false}
                      disabled={true}
                      aria-label="Select all"
                    />
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.accessorKey}
                      className="group relative px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      <div className="flex items-center justify-between cursor-pointer">
                        <span>{column.header}</span>
                        <div className="flex">
                          <ArrowUpDown className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="py-4 text-center">
                      <div className="flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    </td>
                  </tr>
                ) : pesquisas.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="py-4 text-center text-gray-500">
                      Nenhuma pesquisa encontrada
                    </td>
                  </tr>
                ) : (
                  pesquisas.map((pesquisa) => (
                    <tr key={pesquisa.id} className="hover:bg-gray-50">
                      <td className="w-12 pl-4 pr-0 py-4">
                        <Checkbox
                          checked={false}
                          disabled={true}
                          aria-label={`Selecionar ${pesquisa.nome}`}
                        />
                      </td>
                      {columns.map((column) => (
                        <td key={column.accessorKey} className="px-3 py-4">
                          {column.cell 
                            ? column.cell((pesquisa as any)[column.accessorKey], pesquisa)
                            : (pesquisa as any)[column.accessorKey]}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Paginação */}
        {meta && (
          <Pagination
            pageIndex={currentPage}
            totalCount={meta.total || 0}
            perPage={meta.limit || 20}
            onPageChange={handlePageChange}
            isLoading={isLoading}
          />
        )}
      </div>
    );
  }
  
  // Versão completa com DnD, renderizada apenas no cliente
  return (
    <div className="space-y-4">
      {/* Modal de filtro de data */}
      {currentEditingFilter && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 w-[320px] max-w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">
                Filtrar data de {filterTypeNames[currentEditingFilter]}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentEditingFilter(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <DateFilter 
                onChange={handleDateChange} 
                initialDate={tempDateRange} 
                preventAutoSelect={true}
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentEditingFilter(null)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={applyCurrentFilter}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Área de filtros */}
      <div className="flex flex-wrap gap-3 mb-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Filtro principal */}
          <Popover open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
              >
                <Filter className="h-3.5 w-3.5 mr-2" />
                <span className="text-sm">Filtros {getActiveFiltersCount() > 0 ? `(${getActiveFiltersCount()})` : ''}</span>
                <ChevronDown className="h-3.5 w-3.5 ml-2" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[300px]" align="start" sideOffset={5}>
              <div className="p-3">
                <h4 className="font-medium mb-2">Filtros de data</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 border rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="filter-captacao"
                        checked={!!activeFilters.captacao}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            openDateFilterForType('captacao');
                          } else {
                            removeFilter('captacao');
                          }
                        }}
                      />
                      <label htmlFor="filter-captacao" className="text-sm cursor-pointer flex-1">
                        Captação
                      </label>
                    </div>
                    {activeFilters.captacao ? (
                      <div className="flex items-center">
                        <span className="text-xs text-blue-600 mr-1">
                          {formatDateForDisplay(activeFilters.captacao)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => openDateFilterForType('captacao')}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 ml-auto"
                        onClick={() => openDateFilterForType('captacao')}
                        disabled={!activeFilters.captacao}
                      >
                        <span className="text-xs">Selecionar</span>
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between p-2 border rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="filter-pesquisa"
                        checked={!!activeFilters.pesquisa}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            openDateFilterForType('pesquisa');
                          } else {
                            removeFilter('pesquisa');
                          }
                        }}
                      />
                      <label htmlFor="filter-pesquisa" className="text-sm cursor-pointer flex-1">
                        Pesquisa
                      </label>
                    </div>
                    {activeFilters.pesquisa ? (
                      <div className="flex items-center">
                        <span className="text-xs text-blue-600 mr-1">
                          {formatDateForDisplay(activeFilters.pesquisa)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => openDateFilterForType('pesquisa')}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 ml-auto"
                        onClick={() => openDateFilterForType('pesquisa')}
                        disabled={!activeFilters.pesquisa}
                      >
                        <span className="text-xs">Selecionar</span>
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between p-2 border rounded-md hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="filter-vendas"
                        checked={!!activeFilters.vendas}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            openDateFilterForType('vendas');
                          } else {
                            removeFilter('vendas');
                          }
                        }}
                      />
                      <label htmlFor="filter-vendas" className="text-sm cursor-pointer flex-1">
                        Vendas
                      </label>
                    </div>
                    {activeFilters.vendas ? (
                      <div className="flex items-center">
                        <span className="text-xs text-blue-600 mr-1">
                          {formatDateForDisplay(activeFilters.vendas)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => openDateFilterForType('vendas')}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 ml-auto"
                        onClick={() => openDateFilterForType('vendas')}
                        disabled={!activeFilters.vendas}
                      >
                        <span className="text-xs">Selecionar</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 pt-0 border-t mt-3">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    handleClearFilters();
                    setIsFiltersOpen(false);
                  }}
                  className="text-sm"
                  disabled={!hasActiveFilters}
                >
                  Limpar filtros
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => setIsFiltersOpen(false)}
                  className="text-sm"
                >
                  Fechar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          
          {/* Indicador de filtros ativos */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(activeFilters).map(([type, dateRange]) => (
                <div 
                  key={type}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md"
                >
                  <Calendar className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs text-blue-700">
                    {filterTypeNames[type as FilterType]}: {formatDateForDisplay(dateRange)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 p-0 text-blue-700 hover:bg-blue-100"
                    onClick={() => removeFilter(type as FilterType)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          {/* Botão de recarregar */}
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={onRefresh}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              <span className="text-sm">Recarregar</span>
            </Button>
          )}
          
          {/* Botão limpar filtros */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 flex items-center"
              onClick={handleClearFilters}
              title="Limpar todos os filtros"
            >
              <X className="h-4 w-4 mr-1" />
              <span className="text-sm">Limpar filtros</span>
            </Button>
          )}
        </div>
        
        {/* Botões de exportação */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 flex items-center gap-2"
                disabled={isLoading || pesquisas.length === 0}
              >
                <DownloadIcon className="h-4 w-4" />
                <span className="text-sm">Exportar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleExportCurrentPage}
                disabled={pesquisas.length === 0}
              >
                Exportar página atual
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExport}
                disabled={!hasSelectedItems}
              >
                Exportar itens selecionados ({selectedItems.length})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* Tabela de Pesquisas */}
      <div className="rounded-md border">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="w-12 pl-4 pr-0 py-3.5">
                    <Checkbox
                      checked={selectedItems.length === pesquisas.length && pesquisas.length > 0}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <SortableContext
                    items={columns.map((col) => col.accessorKey)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {columns.map((column) => (
                      <SortableHeader
                        key={column.accessorKey}
                        column={column}
                        sortColumn={sortColumn || undefined}
                        sortDirection={sortDirection || undefined}
                        onSort={onSort}
                      />
                    ))}
                  </SortableContext>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="py-4 text-center">
                      <div className="flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    </td>
                  </tr>
                ) : pesquisas.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="py-4 text-center text-gray-500">
                      Nenhuma pesquisa encontrada
                    </td>
                  </tr>
                ) : (
                  pesquisas.map((pesquisa) => (
                    <tr 
                      key={pesquisa.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigateToSurveyDetails(pesquisa.id, pesquisa.survey_id)}
                    >
                      <td 
                        className="w-12 pl-4 pr-0 py-4" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedItems.includes(pesquisa.id)}
                          onCheckedChange={() => toggleRowSelection(pesquisa.id)}
                          aria-label={`Selecionar ${pesquisa.nome}`}
                        />
                      </td>
                      {columns.map((column) => (
                        <td key={column.accessorKey} className="px-3 py-4">
                          {column.cell 
                            ? column.cell((pesquisa as any)[column.accessorKey], pesquisa)
                            : (pesquisa as any)[column.accessorKey]}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DndContext>
      </div>
      
      {/* Paginação */}
      {meta && (
        <Pagination
          pageIndex={currentPage}
          totalCount={meta.total || 0}
          perPage={meta.limit || 20}
          onPageChange={handlePageChange}
          isLoading={isLoading}
        />
      )}
    </div>
  );
} 