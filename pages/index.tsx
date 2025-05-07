import { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabaseClient';

type LoteAPI = {
  Codigo: string;
  Fabricacao: string;
  Vencimento: string;
  Quantidade: number;
};

type ItemAPI = {
  nrItem: number;
  codigo: string;
  valor: number;
  unidade: string;
  quantidade: number;
  lotes: LoteAPI[];
};

export default function Home() {
  const [documento, setDocumento] = useState('');
  const [items, setItems] = useState<ItemAPI[]>([]);
  const [estado, setEstado] = useState<
    Record<string, { item: string; esperada: number; conferida: number }>
  >({});
  const [bip, setBip] = useState('');

  // 1. Buscar pedido e preparar estado
  const buscarPedido = async () => {
    if (!documento.trim()) return alert('Informe o número do documento');
    try {
      const res = await fetch(
        `https://api.maglog.com.br/api-wms.hom/rest/1/event/expedicao?Documento=${documento}`, // ATUALIZAR COM BASE NO TIPO DE API, ESSA URL UTILIZA O NUMERO DO DOCUMENTO = PEDIDO 
        {
          headers: {
            Tenant: 'F8A63EBF-A4C5-457D-9482-2D6381318B8E', //TENANT FIXO DA MAGLOG
            Owner:  '0157A619-B0CF-4327-82B2-E4084DBAC7DD', //OWNER DO CLIENTE, ESSE ATUAL É DA HP
          },
        }
      );
      const data = await res.json();
      console.log('Retorno completo da API:', data);
      const apiItens = data.itens;
      console.log('Array data.itens:', apiItens);

      if (!Array.isArray(apiItens) || apiItens.length === 0) {
        alert('Pedido não encontrado ou sem itens.');
        setItems([]);
        return;
      }

      // Mapeia os itens
      const mapped: ItemAPI[] = apiItens.map((i: any) => ({
        nrItem:   i.nrItem ?? i.NrItem,
        codigo:   i.codigo ?? i.Codigo,
        valor:    Number(i.valor ?? i.Valor),
        unidade:  i.unidade ?? i.Unidade,
        quantidade: Number(i.quantidade ?? i.Quantidade),
        lotes: Array.isArray(i.lotes ?? i.Lotes)
          ? (i.lotes ?? i.Lotes).map((l: any) => ({
              Codigo:     l.codigo ?? l.Codigo,
              Fabricacao: l.fabricacao ?? l.Fabricacao,
              Vencimento: l.vencimento ?? l.Vencimento,
              Quantidade: Number(l.quantidade ?? l.Quantidade),
            }))
          : [],
      }));
      setItems(mapped);

      // Inicializa o estado de conferência para cada lote ou item
      const init: Record<string, { item: string; esperada: number; conferida: number }> =
        {};
      mapped.forEach(i => {
        if (i.lotes.length > 0) {
          i.lotes.forEach(l => {
            init[l.Codigo] = { item: i.codigo, esperada: l.Quantidade, conferida: 0 };
          });
        } else {
          init[i.codigo] = { item: i.codigo, esperada: i.quantidade, conferida: 0 };
        }
      });
      setEstado(init);
    } catch (err) {
      console.error('Erro ao buscar pedido:', err);
      alert('Erro na requisição da API.');
    }
  };

  // 2. Processa bip de lote ou código
  const processarBip = async (entrada: string) => {
    const chave = entrada.trim();
    if (!chave) return;

    if (estado[chave]) {
      await atualizarConferencia(chave);
    } else {
      const item = items.find(i => i.codigo === chave);
      if (item) {
        // confere o primeiro lote/item não completo
        const alvo = item.lotes.length
          ? item.lotes.find(l => estado[l.Codigo].conferida < estado[l.Codigo].esperada)?.Codigo
          : item.codigo;
        if (alvo) await atualizarConferencia(alvo);
        else alert('Todos os lotes/quantidades já conferidos.');
      } else {
        alert('Código ou lote não encontrado no pedido.');
      }
    }
    setBip('');
  };

  const atualizarConferencia = async (chave: string) => {
    const reg = estado[chave];
    if (!reg) return alert('Chave inválida.');
    if (reg.conferida >= reg.esperada) return alert('Quantidade já conferida.');

    const novo = { ...reg, conferida: reg.conferida + 1 };
    setEstado(prev => ({ ...prev, [chave]: novo }));

    await supabase.from('conferencias').insert({
      documento,
      codigo_item: reg.item,
      lote:         chave,
      quantidade_esperada: reg.esperada,
      quantidade_conferida: novo.conferida,
      data:        new Date().toISOString(),
    });
  };

  // Verifica se tudo está conferido
  const todosConferidos = Object.values(estado).every(
    reg => reg.conferida >= reg.esperada
  );

  // 3. Finalizar conferência: alerta e gera PDF em tabela
  const finalizarConferencia = () => {
    if (!todosConferidos) {
      alert('Ainda existem itens pendentes de conferência.');
      return;
    }
    const doc = new jsPDF();
    doc.text(`Conferência Documento: ${documento}`, 10, 10);

    // Monta dados da tabela
    const head = [['Código', 'Lote', 'Quantidade']];
    const body: string[][] = [];
    items.forEach(item => {
      if (item.lotes.length > 0) {
        item.lotes.forEach(l => {
          const reg = estado[l.Codigo];
          body.push([item.codigo, l.Codigo, reg.esperada.toString()]);
        });
      } else {
        const reg = estado[item.codigo];
        body.push([item.codigo, '-', reg.esperada.toString()]);
      }
    });

    autoTable(doc, {
      head: [['Código', 'Lote', 'Quantidade']],
      body,
      startY: 20,
      headStyles: {
        fillColor: [22, 160, 133], // Verde-água (RGB)
        textColor: 255,            // Branco
        fontStyle: 'bold',
      },
      bodyStyles: {
        fillColor: [245, 245, 245], // Cinza claro para linhas
        textColor: [50, 50, 50],    // Cinza escuro
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255], // Branco para linhas alternadas
      },
      styles: {
        fontSize: 10,
        halign: 'center',
      },
    });
    

    doc.save(`conferencia_${documento}.pdf`);
    alert('Conferência realizada com sucesso!');
  };

  return (
    <main style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Conferência de Pedidos</h1>

      <div style={{ marginBottom: 16 }}>
        <input
          value={documento}
          onChange={e => setDocumento(e.target.value)}
          placeholder="Número do Documento"
          style={{ marginRight: 8 }}
        />
        <button onClick={buscarPedido}>Buscar Pedido</button>
      </div>

      {items.length > 0 && (
        <>
          <div style={{ marginBottom: 20 }}>
            <input
              placeholder="Bipe código ou lote"
              value={bip}
              onChange={e => setBip(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && processarBip(bip)}
              style={{ width: 300 }}
            />
          </div>

          <table border={1} cellPadding={6} style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Lote</th>
                <th>Quantidade</th>
                <th>Conferido</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                if (item.lotes.length > 0) {
                  return item.lotes.map(l => {
                    const reg = estado[l.Codigo];
                    const status =
                      reg.conferida >= reg.esperada
                        ? 'OK'
                        : reg.conferida > 0
                        ? 'Item conferido'
                        : '';
                    return (
                      <tr key={`${item.codigo}-${l.Codigo}`}>
                        <td>{item.codigo}</td>
                        <td>{l.Codigo}</td>
                        <td>{l.Quantidade}</td>
                        <td>{status}</td>
                      </tr>
                    );
                  });
                } else {
                  const reg = estado[item.codigo];
                  const status =
                    reg.conferida >= reg.esperada
                      ? 'OK'
                      : reg.conferida > 0
                      ? 'Item conferido'
                      : '';
                  return (
                    <tr key={item.codigo}>
                      <td>{item.codigo}</td>
                      <td>-</td>
                      <td>{item.quantidade}</td>
                      <td>{status}</td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>

          <button
            onClick={finalizarConferencia}
            disabled={!todosConferidos}
            style={{ marginTop: 20 }}
          >
            Finalizar Conferência
          </button>
        </>
      )}
    </main>
  );
}
