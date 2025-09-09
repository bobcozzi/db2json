  -- This list is used on the internal web server as an app.
  -- it refererences the following tables:
     --   RSLDATA - Restocking List Master File
     --   MASTR   - AID Item Master
     --   BLNCE   - AID Inventory Master
     --   RSLOMIT - Items to NOT include on "this" list.
if isWeb();
  #HTTP_OUTFMT JSON     -- Produce JSON results to send to the web browser.
  #json_namecase  lower -- Convert all JSON "field names" to lower case
  #json_colattr   false -- We do not need the field properties (column attributes) nodes
#endif

  // Venue and List are now stored as Cookies
  // But if we run this outside of the web domain,
  // we may pass in these variables as Session Variables
  // so don't bother with the cookies if we do.
  eval &c_loc = getcookie('LOC');
  eval &c_rsl = getcookie('RSL');
if not defined(&loc);
  eval &loc = getcookie('LOC');
endif;
if not defined(&rsl);
  eval &rsl = getcookie('RSL');
endif;

#MSG LOC=&LOC  Cookie_LOC=&c_loc
#MSG RSL=&RSL  Cookie_RSL=&c_rsl

#default &LOC = 'WR'
#default &RSL = '*FIRST'

if &loc = '';            // No loc, then use Wulff Rd location
eval &loc = 'WR';
elseif &loc = 'MALL';    // Mall location
eval &loc = 'M';
elseif &loc = 'MAIN';    // Main Store on Wulff Rd.
eval &loc = 'WR';
elseif &loc = 'WULFF';    // Main Store on Wulff Rd.
eval &loc = 'WR';
endif;

  -- This is for potential JavaScript coding issues
  -- If the elements are undefined, it might assign the string "undefined"
  -- to these variables. So we adapt to that situation here.

#if &loc = 'undefined'    -- JavaScript sometimes uses 'undefined'
#eval &loc = 'WR'
#endif
#if &rsl = 'undefined'
#eval &rsl = '*FIRST'
#endif

#Msg Restocking list "&RSL" at &LOC

#if &rsl = '*FIRST'      -- If user requests *FIRST resocking list, retrieve it
select r.listname INTO &rsl
       FROM aiddata.rsldata R
       WHERE r.venue = '&LOC'
       ORDER BY r.listname
       FETCH FIRST ROW ONLY;
#endif

if NOT isWebEnv();
#H1 Automotive and Industrial Distr, Ltd.
#H2 Restocking List: &LOC / &RSL
#H3 FINALIZED by &SALESID / &SALESPERSON
#endif

SELECT fn.FINALIZED  INTO &fin
   FROM aiddata.rslfinalize fn
   WHERE (fn.venue,fn.listname) = ('&loc','&rsl')
   ORDER BY fn.FINALIZED DESC
   LIMIT 1;

if &SQLState >= '02000';
  eval &omitRange = '';
  eval &packQtyDate = and pq.crtdate is not null;
elseif elem(&fin) = 1;
  eval &omitRange =  and o.stocked > '&fin';
  eval &packQtyDate = and pq.crtdate > '&fin';
endif;

with omit as (
   select distinct o.venue,o.listname,o.vendor,o.item
   FROM aiddata.rslomit O
   WHERE (o.venue,o.listname)=('&loc','&rsl') &omitRange
)
 SELECT
   r.venue     as "Venue",
   r.listname  as "List                Name",
   r.vendor    as "Vendor",
   r.item      as "Item",
   case when r.itemdesc = '' then i.imdes else r.itemdesc end
           as "Item                Desc",
    cast(b.ibqoh as dec(7,0)) as "Qty                 OH",

   case when pq.pullqty is not null then pq.pullqty
        ELSE
            case when i.imum in ('PQ','EA') then i.impqt else 1 end
        end
           as "Pull                QTY",

   aidlib.getimglink(r.vendor,r.item,1) as  ProdImg

  FROM aiddata.rsldata R
  exception join omit D on
     (r.venue,r.listname,r.vendor,r.item) =
     (d.venue,d.listname,d.vendor,d.item)
  inner join aiddata.mastr i on (r.vendor,r.item)=(i.imvnd,i.imitem)
  inner join aiddata.blnce B on (r.vendor,r.item)=(B.ibvnd,b.ibitem)
  left outer join aiddata.rslpullqty PQ on
     (r.venue,r.listname,r.vendor,r.item) =
     (pq.venue,pq.listname,pq.vendor,pq.item) &packQtyDate

  WHERE r.venue = '&LOC' and r.listname = '&RSL'
        and b.ibqoh > 0

 ORDER BY 1,2,3,4 ;
