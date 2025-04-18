'use client'

import { Event } from "@/app/types/events-type"
import { columns as defaultColumns } from "./columns"
import { EventsTableRow } from "./events-table-row"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
import { ArrowUpDown, ChevronDown, ChevronUp, DownloadIcon, Loader2, FileIcon, FileArchiveIcon, FileText, Settings2, RefreshCw } from "lucide-react"
import { Column } from "./columns"
import { EventColumnId } from "../stores/use-events-columns-store"
import { EventsFilters } from "./events-filters"
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { ColumnManagementModal } from "./column-management-modal"
import { Pagination } from "@/components/pagination"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useColumnsStore } from "./stores/columns-store"

/**
 * Função utilitária para converter datas para o formato BRT (horário de Brasília)
 */
function formatDateToBRT(dateStr: string): string {
  try {
    // Converter a string de data para objeto Date
    const dateObj = new Date(dateStr);
    
    // Verificar se a data é válida
    if (!isNaN(dateObj.getTime())) {
      // Converter para o horário de Brasília (BRT, UTC-3)
      const options: Intl.DateTimeFormatOptions = { 
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric', 
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
      
      return dateObj.toLocaleString('pt-BR', options);
    }
  } catch (error) {
    console.error("Erro ao formatar data para BRT:", error);
  }
  
  // Retornar o valor original se não conseguir converter
  return dateStr;
}

interface SortableHeaderProps {
  column: Column;       
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc' | null | string;
  onSort: (columnId: string, direction: 'asc' | 'desc') => void;
}

function SortableHeader({ 
  column,
  sortColumn,
  sortDirection,
  onSort
}: SortableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.accessorKey });

  const isCurrentSortColumn = sortColumn === column.accessorKey;

  // Classe adicional para a coluna de telefone
  const isPhoneColumn = column.accessorKey === "user.phone";
  const columnClass = `px-4 py-2 font-medium text-xs text-gray-500 uppercase tracking-wider cursor-pointer 
    ${isPhoneColumn ? 'min-w-[130px]' : ''}`;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : undefined,
  }

  // Definir larguras por tipo de coluna
  const getColumnWidth = (accessorKey: string) => {
    const columnWidths: Record<string, string> = {
      // Colunas estreitas
      'event_id': '80px',
      'event_name': '140px',
      'event_time': '120px',
      'tipo': '80px',
      'data': '100px',
      'nome': '120px',
      'email': '160px',
      'telefone': '120px',
      'cliente': '80px',
      'profissao': '140px',
      'produto': '140px',
      'funil': '140px',
      
      // Colunas médias
      'utmSource': '140px',
      'utmMedium': '140px',
      'utmCampaign': '180px',
      'utmContent': '160px',
      'utmTerm': '140px',
      'pais': '100px',
      'estado': '100px',
      'cidade': '140px',
      'dispositivo': '120px',
      
      // Valor padrão
      'default': '140px'
    };
    
    return columnWidths[accessorKey] || columnWidths['default'];
  };

  // Estado para largura customizada
  const [width, setWidth] = useState(getColumnWidth(column.accessorKey));
  const [resizing, setResizing] = useState(false);
  
  // Função para lidar com redimensionamento
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setResizing(true);
    
    const startX = e.pageX;
    const startWidth = parseInt(width);
    
    const handleMouseMove = (e: MouseEvent) => {
      const currentX = e.pageX;
      const newWidth = Math.max(80, startWidth + (currentX - startX));
      setWidth(`${newWidth}px`);
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setResizing(false);
      
      // Você pode salvar a largura em localStorage aqui
      const savedWidths = JSON.parse(localStorage.getItem('columnWidths') || '{}');
      savedWidths[column.accessorKey] = width;
      localStorage.setItem('columnWidths', JSON.stringify(savedWidths));
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  // Carregar larguras salvas ao montar
  useEffect(() => {
    const savedWidths = JSON.parse(localStorage.getItem('columnWidths') || '{}');
    if (savedWidths[column.accessorKey]) {
      setWidth(savedWidths[column.accessorKey]);
    }
  }, [column.accessorKey]);

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
        className="flex items-center justify-between"
        {...(resizing ? {} : attributes)}
        {...(resizing ? {} : listeners)}
      >
        <div 
          className="flex items-center cursor-pointer"
          onClick={handleSortClick}
        >
          {column.header}
          {isCurrentSortColumn && (
            <span className="ml-1">
              {sortDirection === 'asc' ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          )}
          {!isCurrentSortColumn && (
            <ArrowUpDown className="ml-1 h-4 w-4 opacity-0 group-hover:opacity-100" />
          )}
        </div>
      </div>
      
      {/* Resizer handle */}
      <div
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize group/resizer"
        onMouseDown={handleResizeMouseDown}
      >
        <div className="h-full w-1 bg-transparent group-hover/resizer:bg-gray-300"></div>
      </div>
    </th>
  );
}

export interface Meta {
  total: number
  page: number
  limit: number
  last_page: number
  profession_id?: number
  funnel_id?: number
}

export interface EventsTableProps {
  events: Event[]
  isLoading: boolean
  meta?: Meta
  error?: any
  searchParams: string
  currentPage: number
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc' | string | null
  onSort: (column: string, direction: 'asc' | 'desc') => void
  onPerPageChange?: (perPage: number) => void
  onExport?: (selectedEvents: Event[]) => void
  onPageChange: (page: number) => void
}

export function EventsTable({
  events,
  isLoading,
  meta,
  searchParams,
  currentPage,
  sortColumn,
  sortDirection,
  onSort,
  onPerPageChange,
  onExport,
  onPageChange
}: EventsTableProps) {
  // Create inline isMounted implementation
  const [isMounted, setIsMounted] = useState(false);
  
  // Set isMounted to true after component mounts (client-side only)
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  const router = useRouter()
  const { visibleColumns } = useColumnsStore()
  
  // Log dos eventos para verificar a estrutura de dados
  useEffect(() => {
    if (events && events.length > 0) {
      console.log('EventsTable received data count:', events.length);
    }
  }, [events]);
  
  // Memorizar as colunas visíveis para evitar re-renderizações desnecessárias
  const columnsData = useMemo(() => 
    visibleColumns
      .map(id => defaultColumns.find(col => col.accessorKey === id))
      .filter(Boolean) as Column[], 
  [visibleColumns])
  
  const [exportAllLoading, setExportAllLoading] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [rowHeight] = useState(46) // altura fixa das linhas
  const [visibleRows, setVisibleRows] = useState(10) // valor padrão inicial
  const [shouldUpdateLimit, setShouldUpdateLimit] = useState(false)
  const [isColumnManagementOpen, setIsColumnManagementOpen] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({})
  const [selectAll, setSelectAll] = useState(false)

  // Recupera filtros da URL - memoizado para evitar recriações desnecessárias
  const getFiltersFromUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    const from = params.get('from');
    const to = params.get('to');
    const timeFrom = params.get('time_from');
    const timeTo = params.get('time_to');
    const professionId = params.get('profession_id');
    const funnelId = params.get('funnel_id');
    
    return {
      dateFrom: from || undefined,
      dateTo: to || undefined,
      timeFrom: timeFrom || undefined,
      timeTo: timeTo || undefined,
      professionId: professionId || undefined,
      funnelId: funnelId || undefined
    }
  }, [searchParams])

  const updateUrl = useCallback((params: Record<string, string | null>) => {
    const newSearchParams = new URLSearchParams(searchParams);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, value);
      }
    });

    router.push(`/events?${newSearchParams.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const handleFilterChange = useCallback((filters: { 
    dateFrom?: string | null | undefined;
    dateTo?: string | null | undefined;
    timeFrom?: string | null | undefined;
    timeTo?: string | null | undefined;
    professionId?: string | null | undefined; 
    funnelId?: string | null | undefined; 
  }) => {
    const params = new URLSearchParams(searchParams);
    
    // Preservar o parâmetro de página atual
    const currentPage = params.get('page') || '1';
    
    // Atualizar parâmetros de data
    if (filters.dateFrom !== undefined) {
      if (filters.dateFrom) {
        params.set('from', filters.dateFrom);
        sessionStorage.setItem('events_from_date', filters.dateFrom);
      } else {
        params.delete('from');
        sessionStorage.removeItem('events_from_date');
      }
    }
    
    if (filters.dateTo !== undefined) {
      if (filters.dateTo) {
        params.set('to', filters.dateTo);
        sessionStorage.setItem('events_to_date', filters.dateTo);
      } else {
        params.delete('to');
        sessionStorage.removeItem('events_to_date');
      }
    }
    
    if (filters.timeFrom !== undefined) {
      if (filters.timeFrom) {
        params.set('time_from', filters.timeFrom);
        sessionStorage.setItem('events_time_from', filters.timeFrom);
      } else {
        params.delete('time_from');
        sessionStorage.removeItem('events_time_from');
      }
    }
    
    if (filters.timeTo !== undefined) {
      if (filters.timeTo) {
        params.set('time_to', filters.timeTo);
        sessionStorage.setItem('events_time_to', filters.timeTo);
      } else {
        params.delete('time_to');
        sessionStorage.removeItem('events_time_to');
      }
    }
    
    // Atualizar parâmetro de profissão
    if (filters.professionId !== undefined) {
      if (filters.professionId) {
        params.set('profession_id', filters.professionId);
      } else {
        params.delete('profession_id');
      }
    }
    
    // Atualizar parâmetro de funil
    if (filters.funnelId !== undefined) {
      if (filters.funnelId) {
        params.set('funnel_id', filters.funnelId);
      } else {
        params.delete('funnel_id');
      }
    }
    
    // Garantir que o parâmetro de página seja mantido
    params.set('page', currentPage);
    
    // Se temos filtros de data válidos, marcar que o filtro foi aplicado
    if (params.get('from') && params.get('to')) {
      sessionStorage.setItem('events_default_filter_applied', 'true');
    }
    
    // Atualizar URL
    const currentParams = new URLSearchParams(searchParams);
    const paramsChanged = params.toString() !== currentParams.toString();
    
    if (paramsChanged) {
      router.push(`/events?${params.toString()}`, { scroll: false });
    }
  }, [router, searchParams]);

  const handleSort = useCallback((columnId: string) => {
    const newParams = new URLSearchParams(searchParams);
    
    // Se clicar na mesma coluna que já está ordenada
    if (sortColumn === columnId) {
      // Se estava ascendente, muda para descendente
      if (sortDirection === 'asc') {
        newParams.set('sortDirection', 'desc');
        newParams.set('sortBy', columnId);
      } 
      // Se estava descendente, muda para ascendente
      else if (sortDirection === 'desc') {
        newParams.set('sortDirection', 'asc');
        newParams.set('sortBy', columnId);
      }
    } 
    // Se clicar em uma nova coluna, começa com ascendente
    else {
      newParams.set('sortDirection', 'asc');
      newParams.set('sortBy', columnId);
    }

    router.push(`/events?${newParams.toString()}`, { scroll: false });
    onSort(columnId, newParams.get('sortDirection') as 'asc' | 'desc');
  }, [router, searchParams, sortColumn, sortDirection, onSort]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (result: DragEndEvent) => {
    const { active, over } = result;
    
    if (!over) return;
    
    if (active.id !== over.id) {
      const oldIndex = visibleColumns.indexOf(active.id as string);
      const newIndex = visibleColumns.indexOf(over.id as string);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrderColumns = arrayMove(visibleColumns, oldIndex, newIndex);
        
        // Update the store with the new column order
        useColumnsStore.setState({ visibleColumns: newOrderColumns });
        
        // No need to update columnsData as it will be updated via useMemo effect
      }
    }
  }

  // Calcular a quantidade de linhas que cabem na tela
  useEffect(() => {
    function calculateVisibleRows() {
      if (!tableContainerRef.current) return
      
      const container = tableContainerRef.current
      const containerHeight = container.clientHeight
      const headerHeight = 48 // altura do cabeçalho
      const paginationHeight = 56 // altura da paginação
      
      // Calcula quantas linhas cabem no espaço disponível
      const availableHeight = containerHeight - headerHeight - paginationHeight
      const calculatedRows = Math.floor(availableHeight / rowHeight)
      
      // No mínimo 5 linhas, ou usa o cálculo
      const newVisibleRows = Math.max(5, calculatedRows)
      
      if (newVisibleRows !== visibleRows) {
        setVisibleRows(newVisibleRows)
        setShouldUpdateLimit(true) // Marca que precisamos atualizar o limite
      }
    }

    // Calcula inicialmente após o componente montar
    const timer = setTimeout(calculateVisibleRows, 100)
    
    // Recalcula quando a janela for redimensionada
    window.addEventListener('resize', calculateVisibleRows)
    
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', calculateVisibleRows)
    }
  }, [rowHeight])

  // Atualiza o limite apenas quando marcado para atualizar
  useEffect(() => {
    if (shouldUpdateLimit) {
      const params = new URLSearchParams(searchParams);
      const currentLimit = Number(params.get('limit') || 10);
      
      // Só atualiza se o limite calculado for diferente do atual
      if (visibleRows !== currentLimit) {
        const updateParams = new URLSearchParams(searchParams);
        updateParams.set('limit', visibleRows.toString());
        router.push(`/events?${updateParams.toString()}`, { scroll: false });
      }
      
      setShouldUpdateLimit(false); // Reset a flag
    }
  }, [shouldUpdateLimit, visibleRows, router, searchParams]);

  const handlePageChange = useCallback((page: number) => {
    // Don't trigger page changes if already loading or same page
    if (isLoading || page === currentPage) return;
    
    // Explicitly set loading state for UI feedback during navigation
    document.querySelector('.table-loading-overlay')?.classList.remove('hidden');
    
    // Atualizar a URL
    const params = new URLSearchParams(searchParams);
    
    // Keep all existing parameters but update the page
    params.set('page', page.toString());
    
    // Remover quaisquer parâmetros incorretos que possam estar causando problemas
    params.delete('[object Object]');
    
    // If no date filter exists, don't add it during page navigation
    // This preserves the simple URL format if the user hasn't set filters yet
    
    router.push(`/events?${params.toString()}`, { scroll: false });
    
    // Chamar a função onPageChange do componente pai para sincronizar state
    onPageChange(page);
  }, [router, searchParams, onPageChange, isLoading, currentPage]);

  // Verificar se todos estão selecionados e atualizar o estado selectAll
  useEffect(() => {
    if (!events || events.length === 0) {
      setSelectAll(false)
      return
    }
    
    const allSelected = events.every(event => selectedRows[event.event_id])
    setSelectAll(allSelected)
  }, [selectedRows, events])
  
  // Selecionar/deselecionar uma linha
  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }
  
  // Selecionar/deselecionar todas as linhas
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedRows({})
    } else {
      const newSelectedRows: Record<string, boolean> = {}
      events.forEach(event => {
        newSelectedRows[event.event_id] = true
      })
      setSelectedRows(newSelectedRows)
    }
    setSelectAll(!selectAll)
  }
  
  // Exportar eventos selecionados
  const handleExport = () => {
    const selectedEvents: Event[] = events.filter(event => selectedRows[event.event_id])
    
    if (selectedEvents.length === 0) {
      alert('Selecione pelo menos um evento para exportar')
      return
    }
    
    // Obter cabeçalhos das colunas visíveis
    const headers = columnsData.map(column => column.header)
    
    // Formatar os dados para CSV
    const rows = selectedEvents.map(event => {
      return columnsData.map(column => {
        const key = column.accessorKey
        let value = ''
        
        if (key.includes('.')) {
          // Lidar com propriedades aninhadas
          const keys = key.split('.')
          let currentValue: any = event
          
          for (const k of keys) {
            if (currentValue === null || currentValue === undefined) {
              value = '-'
              break
            }
            currentValue = currentValue[k as keyof typeof currentValue]
          }
          
          value = currentValue !== undefined ? String(currentValue) : '-'
        } else {
          // Propriedade direta
          const eventKey = key as keyof typeof event
          value = event[eventKey] !== undefined ? String(event[eventKey]) : '-'
        }
        
        // Formatação especial para campos de data (event_time)
        if (key === 'event_time' && value && value !== '-') {
          value = formatDateToBRT(value);
        }
        
        // Escapar vírgulas e aspas no valor para CSV
        return `"${value.replace(/"/g, '""')}"`
      }).join(',')
    })
    
    // Criar conteúdo CSV
    const csvContent = [
      headers.join(','),
      ...rows
    ].join('\n')
    
    // Criar blob e URL
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    
    // Criar link para download
    const link = document.createElement('a')
    const date = new Date()
    // Formatar data no horário de Brasília para o nome do arquivo
    const brazilDate = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-')
    link.setAttribute('href', url)
    link.setAttribute('download', `eventos_exportados_${brazilDate}.csv`)
    link.style.visibility = 'hidden'
    
    // Adicionar à página, clicar e remover
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // Opcional: chamar callback de exportação
    if (onExport) {
      onExport(selectedEvents)
    }
  }

  // Exportar todos os eventos da tabela atual
  const handleExportCurrentPage = () => {
    if (events.length === 0) {
      alert('Não há eventos para exportar');
      return;
    }
    
    // Obter cabeçalhos das colunas visíveis
    const headers = columnsData.map(column => column.header);
    
    // Formatar os dados para CSV
    const rows = events.map(event => {
      return columnsData.map(column => {
        const key = column.accessorKey;
        let value = '';
        
        if (key.includes('.')) {
          // Lidar com propriedades aninhadas
          const keys = key.split('.');
          let currentValue: any = event;
          
          for (const k of keys) {
            if (currentValue === null || currentValue === undefined) {
              value = '-';
              break;
            }
            currentValue = currentValue[k as keyof typeof currentValue];
          }
          
          value = currentValue !== undefined ? String(currentValue) : '-';
        } else {
          // Propriedade direta
          const eventKey = key as keyof typeof event;
          value = event[eventKey] !== undefined ? String(event[eventKey]) : '-';
        }
        
        // Formatação especial para campos de data (event_time)
        if (key === 'event_time' && value && value !== '-') {
          value = formatDateToBRT(value);
        }
        
        // Escapar vírgulas e aspas no valor para CSV
        return `"${value.replace(/"/g, '""')}"`;
      }).join(',');
    });
    
    // Criar conteúdo CSV
    const csvContent = [
      headers.join(','),
      ...rows
    ].join('\n');
    
    // Criar blob e URL
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Criar link para download
    const link = document.createElement('a');
    // Formatar data no horário de Brasília para o nome do arquivo
    const date = new Date()
    const brazilDate = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-')
    link.setAttribute('href', url);
    link.setAttribute('download', `eventos_pagina_${meta?.page || 1}_${brazilDate}.csv`);
    link.style.visibility = 'hidden';
    
    // Adicionar à página, clicar e remover
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Limpar URL
    URL.revokeObjectURL(url);
  };

  // Exportar todos os eventos com base nos filtros aplicados
  const handleExportAll = useCallback(async () => {
    // Confirmar a exportação
    const totalRegistros = meta?.total || 0;
    
    let mensagem = `Você está prestes a exportar ${totalRegistros} registros.`;
    
    if (totalRegistros > 10000) {
      mensagem += ` Este é um volume muito grande de dados e a exportação pode levar vários minutos ou até falhar dependendo do seu navegador.`;
    } else if (totalRegistros > 1000) {
      mensagem += ` Isso pode levar algum tempo.`;
    }
    
    mensagem += ` Deseja continuar?`;
    
    if (!confirm(mensagem)) {
      return;
    }
    
    try {
      // Mostrar indicador de carregamento
      setExportAllLoading(true);
      setExportProgress(0);
      
      // Criar parâmetros com os filtros atuais
      const baseParams = new URLSearchParams(searchParams.toString());
      baseParams.delete('page'); // Remover página atual
      baseParams.delete('limit'); // Remover limite atual
      
      
      // Primeiro, tentar obter todos os registros de uma vez
      const exportParams = new URLSearchParams(baseParams.toString());
      exportParams.set('export', 'true');
      
      
      let allEvents: Event[] = [];
      let usedPagination = false;
      
      // Primeira tentativa: obter todos os registros de uma vez
      try {
        const response = await fetch(`/api/events?${exportParams.toString()}`);
        if (!response.ok) {
          throw new Error(`Erro na exportação direta: ${response.status}`);
        }
        
        const data = await response.json();
        allEvents = data.events || [];
        
        
        // Se recebemos menos registros do que o esperado, vamos usar paginação
        if (allEvents.length < totalRegistros) {
          usedPagination = true;
          
          // Informar o usuário que estamos mudando para paginação
          
          // Limpar os eventos obtidos e usar paginação
          allEvents = [];
          
          // Definir um tamanho de página grande para minimizar o número de requisições
          const pageSize = 1000;
          const totalPages = Math.ceil(totalRegistros / pageSize);
          
          // Atualizar o progresso para mostrar que estamos buscando os dados
          setExportProgress(1); // 1% para mostrar que começamos
          
          // Buscar todas as páginas
          for (let page = 1; page <= totalPages; page++) {
            const pageParams = new URLSearchParams(baseParams.toString());
            pageParams.set('page', String(page));
            pageParams.set('limit', String(pageSize));
            
            
            const pageResponse = await fetch(`/api/events?${pageParams.toString()}`);
            if (!pageResponse.ok) {
              throw new Error(`Erro ao buscar página ${page}: ${pageResponse.status}`);
            }
            
            const pageData = await pageResponse.json();
            const pageEvents = pageData.events || [];
            
            
            // Adicionar os eventos desta página ao total
            allEvents = [...allEvents, ...pageEvents];
            
            // Atualizar o progresso (reservamos 50% do progresso para a busca dos dados)
            const fetchProgress = Math.round((page / totalPages) * 50);
            setExportProgress(fetchProgress);
            
            // Pequena pausa para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        }
      } catch (error) {
        console.error('Erro na exportação direta, tentando paginação:', error);
        
        // Se a exportação direta falhar, tentar com paginação
        usedPagination = true;
        
        // Definir um tamanho de página grande para minimizar o número de requisições
        const pageSize = 1000;
        const totalPages = Math.ceil(totalRegistros / pageSize);
        
        // Atualizar o progresso para mostrar que estamos buscando os dados
        setExportProgress(1); // 1% para mostrar que começamos
        
        // Buscar todas as páginas
        for (let page = 1; page <= totalPages; page++) {
          const pageParams = new URLSearchParams(baseParams.toString());
          pageParams.set('page', String(page));
          pageParams.set('limit', String(pageSize));
          
          
          const pageResponse = await fetch(`/api/events?${pageParams.toString()}`);
          if (!pageResponse.ok) {
            throw new Error(`Erro ao buscar página ${page}: ${pageResponse.status}`);
          }
          
          const pageData = await pageResponse.json();
          const pageEvents = pageData.events || [];
          
          
          // Adicionar os eventos desta página ao total
          allEvents = [...allEvents, ...pageEvents];
          
          // Atualizar o progresso (reservamos 50% do progresso para a busca dos dados)
          const fetchProgress = Math.round((page / totalPages) * 50);
          setExportProgress(fetchProgress);
          
          // Pequena pausa para não sobrecarregar a API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      }
      
      if (allEvents.length === 0) {
        alert('Não há eventos para exportar');
        setExportAllLoading(false);
        setExportProgress(0);
        return;
      }
      
      // Verificar se obtivemos todos os registros
      if (allEvents.length < totalRegistros) {
        console.warn(`Atenção: Recebidos menos eventos (${allEvents.length}) do que o esperado (${totalRegistros})`);
        
        // Perguntar ao usuário se deseja continuar mesmo com menos registros
        if (!confirm(`Foram recebidos apenas ${allEvents.length} de ${totalRegistros} registros. Deseja continuar com a exportação parcial?`)) {
          setExportAllLoading(false);
          setExportProgress(0);
          return;
        }
      }
      
      // Obter cabeçalhos das colunas visíveis
      const headers = columnsData.map(column => column.header);
      
      // Iniciar com os cabeçalhos
      const csvRows = [headers.join(',')];
      
      // Processar os dados em lotes para evitar travamentos com grandes volumes
      const totalEvents = allEvents.length;
      
      // Ajustar o tamanho do lote com base no número total de registros
      let batchSize = 1000;
      if (totalEvents > 50000) {
        batchSize = 5000;
      } else if (totalEvents > 10000) {
        batchSize = 2000;
      }
      
      const totalBatches = Math.ceil(totalEvents / batchSize);
      
      
      // Calcular o progresso inicial com base no método usado
      // Se usamos paginação, já usamos 50% do progresso para buscar os dados
      // Caso contrário, começamos do zero
      let progressOffset = usedPagination ? 50 : 0;
      
      for (let i = 0; i < totalBatches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, totalEvents);
        const batch = allEvents.slice(start, end);
        
        
        // Formatar os dados do lote para CSV
        const batchRows = batch.map((event: Event) => {
          return columnsData.map(column => {
            const key = column.accessorKey;
            let value = '';
            
            if (key.includes('.')) {
              // Lidar com propriedades aninhadas
              const keys = key.split('.');
              let currentValue: any = event;
              
              for (const k of keys) {
                if (currentValue === null || currentValue === undefined) {
                  value = '-';
                  break;
                }
                currentValue = currentValue[k as keyof typeof currentValue];
              }
              
              value = currentValue !== undefined ? String(currentValue) : '-';
            } else {
              // Propriedade direta
              const eventKey = key as keyof typeof event;
              value = event[eventKey] !== undefined ? String(event[eventKey]) : '-';
            }
            
            // Formatação especial para campos de data (event_time)
            if (key === 'event_time' && value && value !== '-') {
              value = formatDateToBRT(value);
            }
            
            // Escapar vírgulas e aspas no valor para CSV
            return `"${value.replace(/"/g, '""')}"`;
          }).join(',');
        });
        
        // Adicionar as linhas do lote ao CSV
        csvRows.push(...batchRows);
        
        // Atualizar o progresso
        // Se usamos paginação, os 50% restantes são para o processamento
        // Caso contrário, usamos 100% para o processamento
        const processingProgress = Math.round(((i + 1) / totalBatches) * (100 - progressOffset));
        setExportProgress(progressOffset + processingProgress);
        
        // Permitir que a UI seja atualizada
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      
      // Criar conteúdo CSV
      const csvContent = csvRows.join('\n');
      
      // Criar blob e URL
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      // Criar link para download
      const link = document.createElement('a');
      // Formatar data no horário de Brasília para o nome do arquivo
      const date = new Date()
      const brazilDate = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-')
      link.setAttribute('href', url);
      link.setAttribute('download', `todos_eventos_exportados_${brazilDate}.csv`);
      link.style.visibility = 'hidden';
      
      // Adicionar à página, clicar e remover
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Limpar URL
      URL.revokeObjectURL(url);
      
    } catch (error: any) {
      console.error('Erro ao exportar todos os eventos:', error);
      alert(`Erro ao exportar eventos: ${error.message || 'Erro desconhecido'}. Por favor, tente novamente.`);
    } finally {
      setExportAllLoading(false);
      setExportProgress(0);
    }
  }, [columnsData, searchParams, meta]);

  // Replace the early return with a variable
  let tableContent = (
    <div className="flex flex-col w-full h-full">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <EventsFilters 
            onFilterChange={handleFilterChange}
            initialFilters={useMemo(() => ({
              ...getFiltersFromUrl(),
              professionId: meta?.profession_id?.toString(),
              funnelId: meta?.funnel_id?.toString()
            }), [getFiltersFromUrl, meta?.profession_id, meta?.funnel_id])}
          />
          {Object.keys(selectedRows).filter(id => selectedRows[id]).length > 0 && (
            <span className="text-sm text-gray-500 ml-2">
              {Object.keys(selectedRows).filter(id => selectedRows[id]).length} selecionados
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(selectedRows).filter(id => selectedRows[id]).length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1"
              onClick={handleExport}
            >
              <DownloadIcon className="h-4 w-4" />
              Exportar selecionados
            </Button>
          )}
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex items-center gap-1"
                  disabled={exportAllLoading}
                >
                  {exportAllLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Exportando... {exportProgress > 0 ? `${exportProgress}%` : ''}</span>
                    </>
                  ) : (
                    <>
                      <DownloadIcon className="h-4 w-4" />
                      <span>Exportar</span>
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleExportCurrentPage} disabled={events.length === 0}>
                  <FileIcon className="h-4 w-4 mr-2" />
                  Exportar página atual
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportAll}>
                  <FileArchiveIcon className="h-4 w-4 mr-2" />
                  Exportar todos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsColumnManagementOpen(true)}
              className="flex items-center gap-1"
            >
              <Settings2 className="h-4 w-4" />
              Colunas
            </Button>
            <ColumnManagementModal
              isOpen={isColumnManagementOpen}
              onClose={() => setIsColumnManagementOpen(false)}
              visibleColumns={visibleColumns}
              onColumnChange={(newColumns) => {
                useColumnsStore.setState({ visibleColumns: newColumns })
              }}
            />
          </div>
        </div>
      </div>
      <div className="border rounded-md overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1 relative" ref={tableContainerRef}>
          <div className={`absolute inset-0 bg-white/70 z-50 flex items-center justify-center table-loading-overlay ${isLoading ? '' : 'hidden'}`}>
            <div className="flex flex-col items-center">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
              <span className="mt-2 text-sm font-medium text-gray-600">Carregando...</span>
            </div>
          </div>
          
          {/* Render a static table during SSR, and the DndContext only on client */}
          {!isMounted ? (
            <table className="w-full min-w-full whitespace-nowrap text-[13px] relative">
              <thead className="bg-zinc-100 sticky top-0 z-20">
                <tr className="divide-x divide-gray-200">
                  <th className="w-10 px-3 py-3.5 text-left">
                    <Checkbox checked={false} aria-label="Selecionar todos" />
                  </th>
                  {columnsData.map((column) => (
                    <th 
                      key={column.accessorKey}
                      className="group relative px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center cursor-pointer">
                          {column.header}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {!isLoading && (!events || events.length === 0) && (
                  <tr>
                    <td 
                      colSpan={columnsData.length + 1} 
                      className="px-6 py-4 text-center text-gray-500 text-xs"
                    >
                      Nenhum evento encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <DndContext 
              sensors={sensors} 
              collisionDetection={closestCenter} 
              onDragEnd={handleDragEnd}
            >
              <table className="w-full min-w-full whitespace-nowrap text-[13px] relative">
                <thead className="bg-zinc-100 sticky top-0 z-20">
                  <tr className="divide-x divide-gray-200">
                    {/* Coluna de seleção */}
                    <th className="w-10 px-3 py-3.5 text-left">
                      <Checkbox 
                        checked={selectAll} 
                        onCheckedChange={toggleSelectAll}
                        aria-label="Selecionar todos"
                      />
                    </th>
                    {/* Restante das colunas */}
                    <SortableContext 
                      items={columnsData.map(col => col.accessorKey)} 
                      strategy={horizontalListSortingStrategy}
                    >
                      {columnsData.map((column) => (
                        <SortableHeader
                          key={column.accessorKey}
                          column={column}
                          sortColumn={sortColumn}
                          sortDirection={sortDirection as 'asc' | 'desc' | null}
                          onSort={handleSort}
                        />
                      ))}
                    </SortableContext>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Array.isArray(events) && events.map((event: Event, index: number) => (
                    <EventsTableRow 
                      key={`${event.event_id}-${index}`}
                      event={event} 
                      visibleColumns={columnsData.map(col => col.accessorKey as EventColumnId)}
                      isSelected={!!selectedRows[event.event_id]}
                      onSelectChange={toggleRowSelection}
                    />
                  ))}
                  {/* Linhas vazias para preencher o espaço restante */}
                  {Array.isArray(events) && events.length > 0 && events.length < visibleRows && (
                    Array.from({ length: visibleRows - events.length }).map((_, index) => (
                      <tr key={`empty-${index}`} className="h-[46px]">
                        <td className="w-10 px-3 py-3.5 border-b"></td>
                        {columnsData.map((col) => (
                          <td key={`empty-${index}-${col.accessorKey}`} className="px-4 py-2 border-b"></td>
                        ))}
                      </tr>
                    ))
                  )}
                  {(!events || events.length === 0) && !isLoading && (
                    <tr>
                      <td 
                        colSpan={columnsData.length + 1} 
                        className="px-6 py-4 text-center text-gray-500 text-xs"
                      >
                        Nenhum evento encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DndContext>
          )}
        </div>
        {/* Sempre exibir a paginação, mesmo quando não há resultados */}
        <div className="p-2 border-t bg-white">
          <Pagination
            pageIndex={currentPage} 
            totalCount={meta?.total || 0}
            perPage={meta?.limit || 10}
            onPageChange={handlePageChange}
            onPerPageChange={onPerPageChange}
            isLoading={isLoading}
            onRefresh={() => {
              // Show loading state
              document.querySelector('.table-loading-overlay')?.classList.remove('hidden');
              
              // Trigger a refetch without changing the page
              window.dispatchEvent(new CustomEvent('refetch-events'));
            }}
          />
        </div>
      </div>
    </div>
  );

  return tableContent;
} 