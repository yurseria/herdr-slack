import {div} from "gpui-kit";
import {h_flex,v_flex} from "gpui-base";

// Own the edge backgrounds: overflow_hidden does not clip child backgrounds
// to a parent's rounded corners in every GPUI runtime.
export function renderTable(id,table,t,dark,markdown) {
 const stroke=dark?1:0.5;
 return v_flex().w_full().flex_none().rounded(10).overflow_hidden().border(stroke).border_color(t.border).bg(t.background)
  .children(table.rows.map((row,rowIndex)=>h_flex().w_full().flex_none()
   .when(rowIndex===0,el=>el.bg(t.surface).rounded_t(9))
   .when(rowIndex===0&&table.rows.length===1,el=>el.rounded_b(9))
   .when(rowIndex>0,el=>el.border_t(stroke).border_color(t.border))
   .children(row.map((cell,column)=>div().flex_1().min_w(0).px(12).py(8).text_size(13)
    .when(column>0,el=>el.border_l(stroke).border_color(t.border))
    .when(rowIndex===0,el=>el.font_semibold())
    .when(table.align[column]==='right',el=>el.text_right())
    .when(table.align[column]==='center',el=>el.text_center())
    .child(markdown(`${id}-${rowIndex}-${column}`,cell||' '))))));
}
