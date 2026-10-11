# Nâng cấp/khôi phục — đang hoàn thiện

Chỉ forward migrations mới; không sửa lịch sử đã áp dụng. QA: fresh schema từ0 và upgrade clone có dữ liệu86 migrations PR41. Gói apply transactional, data/effect/hash và recovery archive; không Production.

Old OPEN count thiếu basis mới phải đếm lại, giữ history; old APPROVED/posted không tính lại/overwrite. Dữ liệu cũ cần quyết định xuất impact list, không tự sửa số dư.

Sau source refund/transfer/vendor-return mới, down migration/xóa bảng không phải recovery. Diễn tập QA restore; Production recovery/cutover cần phê duyệt riêng và reconcile dữ liệu mới.

## Package1 evidence

89 migrations từ0 PASS trên native17 application schema + Auth shim; không phải managed Auth/Storage recovery. Upgrade86→89 giữ nguyên columns/rows business đã có; 3 forward files, gồm qualifier correction trước nghiệm thu. Archive native trước gói restore102 public tables/86 history, hash/count khớp. Không Production.

Các87..89 phải triển khai như gói trước mở lưu lượng mới; không cho phép operator dùng chức năng giữa file87 và88. Source87 không sửa sau QA apply; correction88 giữ lịch sử forward. Old OPEN count phải ghi lại basis; old APPROVED không tính lại.

## Package3 — dữ liệu đang mở

Gói95–103 chỉ forward, old public columns/rows giữ nguyên per-apply manifests. Fresh103 từ0 PASS. File95–98 có sửa tiếp theo cho immutable assignment/zero load/read boundary; phải triển khai toàn gói trước mở lưu lượng. Không rewrite forward đã áp dụng QA.

Existing vehicles giữ cap/UOM nhưng căn cứ xác minh mới NULL, không được tự gắn đã xác minh. Owner chủ động nhập căn cứ qua danh mục; cap/UOM không đổi được xác minh kể cả xe đang được phân. Người trên assignment cũ thiếu work.claim phải được rà: trước bắt đầu có thể reassign người đủ quyền; đã bắt đầu không đơn giản đổi, cần quyết định/bàn giao có căn cứ. Không tự đổi role, phiếu hoặc số dư lịch sử để thông qua. Nhiều warehouse trong một phiếu cũ phải review/tách trước xuất; không giả tất cả đã lấy cùng lúc.

## G07 — forward104–109

Toàn gói giữ nguyên dữ liệu/cột nghiệp vụ cũ theo mỗi apply manifest; không tự tính lại advance hoặc sửa lịch sử. Advance consumption mới chỉ phân loại allocation thực, không tạo cash event. Giữ compatibility canonical RPC, cho phép nhiều partial intents cùng nguồn/nợ. Read permission phân AR customer/AP supplier; private balance helpers không mở EXECUTE. Forward109 sửa caller EXECUTE của function trong view qua guarded public reader, không mở raw helper.

Fresh109 từ0 PASS native PG17/Auth shim. Triển khai cùng gói trước mở chức năng mới vì các forward reader/permission correction phải có đủ. Backups pre-apply riêng tư600; không claim đã diễn tập restore109 hay Managed Auth/Storage recovery. Không Production apply.

## Tổng cargo110–112 và archive109

Loading legacy/actual khóa xe trước warehouse custody; tính cargo của vehicle tại handoff thực, không dựa vào lịch hoặc execution state để xóa hàng. Return/loss terminal giải phóng lượng thực; direct không có inventory transit giả. Catalog cap/UOM/active giữ nguyên khi xe còn cargo, cập nhật lại cùng cap/căn cứ vẫn theo contract cũ. Exception board lấy loaded−accepted−terminal resolved, giữ report gốc.

Apply110/111/112 mỗi gói transactional, hash/count tất cả cột/dòng cũ giữ nguyên. Fresh112 từ0 PASS. Backup pre110109 restore104public tables +109history khớp; bổ sung này supersedes giới hạn restore109 ở đoạn trên, vẫn không Managed Auth/Storage/PITR. Scan existing QA phát hiện3xe giả20 vớicargo42/28/28 từ test cũ. Migration không tự sửa; bản nâng cấp cần đọc impact và xử lý nguồn/mức nhận/trả/loss bằng nghiệp vụ trước lấy thêm. Không gọi dataset cũ sạch bằng cách rewrite hàng đã ghi.

Advisors111 và restored109 cùng11definer view ERROR/5permissive policy WARN; không có finding mới110/111 nhưng advisor chưa clean. Không đổi views sang invoker mù quáng vì masked/cost-column reader cần contract và negative role tests; broad cross-branch/cost sweep cuối còn chờ.

## Tài chính113–118

Customercredit nguồn immutable Return/ARadjustment +released allocation +fundlot; signedsettlements refund/offset/reversal. Drop pair reversal unique thành bounded aggregate guard để nhiều partial return dùng cùng original allocation hợp lệ. Paymentavailable trừ fundsreserved, refund không làm tiền gốc tự do dùng lại. Zero billable quyết định0 riêng không fakeAR/cash. Existing legacy return adjustments không tự tạo credit/funds; cần đối chiếu nguồn, UI không ghi giảm thêm. Before reproduction legacynegativeAR vẫn giữ facts.

Fresh118 từ0 PASS; allforward apply oldcolumns/rows hash giữ nguyên. Native archive109 recovery104tables đã đạt trước khi clone dùng thêm G16 reproduction; certificate chỉ thời điểm restore. Chưa restore118/managedAuthStorage. New columns provenance/adjustment_kind không backfill quá khứ. Typedrevenue fact mới linkeduniqueARadjustment; reports oldreturn readthrough sourceFK chỉ khi không có typedrow, do đó không giảmhai lần hoặc rewriteposted. Financeperiod/cutoff vàcostgrain actualevidence đã có.

Already-paid commissions giữ nghĩa vụ/cash/earning cũ và tạo reconciliation sourcecase; không tự salaryclawback hoặc gọi quyết định này complete. Reviewcase resolution/payrollsettlement chưa có. Source max/cumulative return and customer funds caps enforced; generic paidprice decrease còn outstanding guard cũ, không tự tạo credit-price. These limits remain in gap status before broader rollout. No Production apply/deploy.


Schema119–121: each forward QAupgrade saved private600 nativebackup and old publiccolumn/row hash/count invariant. No replay118 or earlier.119 exact manualquantity/conversion and cumulative splitreturn cap;120 scoped sourcecommand audit;121 correct result_type physicalcolumn.120 applied schema succeeded but runtimecriticalcommands failed atomically before121; upgrade must apply all three in order before opening traffic. Fresh121 fromtemplate0 passed all121 migrations/RLS. Restore remains isolated native backup; managedAuth/Storage recovery not claimed. Latest financial schema118 and native109 recovery evidence retained; latest121 backup restore rehearsal pending before final release readiness.


122–125: private recordingstart/table withRLS+noauthgrants; existing publicrows/columns unchangedoneachQAupgrade.122 removesordinaryACTIVErequirement,123 completesrequired audittrace,124 scopes historicalknowledge,125 fixesworkassignment branchauditlookup. Apply all forwardsbefore openingtraffic. Backupspre122–125 private600 retained; nativepre125 restore asnewhx_remediation_recovery124_g11 confirmed109publictables/count+hash andhistory124; originalQA/Productionnotoverwritten. Fresh125pass. Existingoperationalstates/version/activationIDs neverchanged bymigrations; legacyopeningcap stillrequired; nofakeopening0. Firstvalidnewsource recordsstart+auditatomic; failedfirstsource no persistentstart. NoManagedAuth/StoragePITRclaim.


126–129: mỗi forward có private600 backup và chứng minh old publiccolumns/rows hash+count không đổi. Server price priority/snapshot helper126, purchase priority127, retail commandreceipt/recovery128, giữ namespace version hiện hữu129. Không replay/copy nền PR41. Fresh129 từ0/RLS0. Backuppre126..129 được giữ; khôi phục129 cuối còn chờ trước bàn giao toàn nhiệm vụ. Không Production/realInvoice/realMoney/realRights.


130–136: each private600 backup beforeforward keptold publiccolumns/rows hash+count. Legacyfundreconciliation happensonlyexplicitcommand againstvalidolddecision/sources; no migrationbackfillRA/cash/stock.132 quantitypolicy newcolumnNULL foroldrows, no historicalearningsrewrite.133unappliedsyntaxfailure fullyrolledback; correctedunappliedfile thenhistory133.134resolution+135existingADJOPEXcontract+136reliableintents allorderedforwards. NewpublicresolutiontableRLS/noauthwrite, immutabledecisions; oldearnedpaid161k preserved. Fresh136from0/RLS0. Latest136nativearchive restore finalstillpending; ManagedAuthStoragePITR notverified.

## Gói9–10 /137–142

Deploy all forwards together before opening newexpense/transfer forms. Preserve old facts; no backfill stock/cash/AP/cost, no opening gate or activation change. Expense links refer immutable assignment snapshots and vendor references, cannot rewrite approved expense. Transfers use their own source events and inventory movement references; do not substitute stock adjustments. One SKU/two same-branch warehouses, external transport fees one delivery attempt; multi-SO group/cross-branch transfers outside supported model and rejected by source scope.

137 alias defect fixed138,139 source parameter ambiguity fixed140,141 recovery/outcomes,142 canonical numeric-text readers and approved loss OPEX. Migrations immutable after QA apply. Apply on representative schema136→142 kept every old public row/column hash/count; native archive pre142/schema141 restored113 tables and141 history exactly. Fresh142 from0/RLSmissing0 passed. These archives cover local application DB + AuthUID shim; no claim ManagedAuth/Storage/PITR recovery. After newsource events, do not drop columns/tables/down-migrate; restore isolated archive, reconcile new events and follow approved recovery plan. No Production write/deploy.

## Gói11 /143–154

Deploy all source/credit/recovery/valuation forwards together before opening supplier-return UI. New tables/column refs preserve legacy receipts, money, AP and histories. SourceUnit fromoriginalPOLine, explicit physicaldestinationSUPPLIER avoids fakeWH; actual recordedWarehouse returns preserve source. CreditLedger reservesreleasedoriginalpayment; refund/offset/sourceguard remainatomic; do notundo/dropledger after newposts. Legacyevents before151 retainactualpostedsourcevalue, newevents captureactualWH value and sequencedacceptancecost; no retroactivehistoryrewrite. Source-retiredquantity/verifiedcargo guards blockreusing returned/lostunit; replacement usesappropriate newrecordedsource withoutchanging oldPOprice/limit. Inventorydifference masked separatelyfromvendorapprovedamount.

Allapply manifests oldpubliccols/rowhash/countunchanged. Initial146unappliedDDLcolumnnameerror rolledback andcorrectedbeforeapply; applied143–154immutable. Fresh150/RLS0 andisolatedpre150/schema149118table restoration/history/hashpassed. Fresh154/RLS0 và restorepre154/schema153118bảng/hash/historyPASS. AuthUIDshim recovery coverslocal applicationDB, notManagedAuth/StoragePITR. NoProduction writes/deploy/realbank. Legalinvoiceprovider remainsblockedonlythatboundary.

## Gói12–14 /155–164

Deploy all document/notice/status forwards with readers before enabling forms. Matching documents are AP-neutral metadata with immutable snapshots/coverage; canceldraftmetadata releasescoverage, doesnotundoCash/AR/AP. Existinginvoicelegalprovider remainsNOT_CONFIGURED; exportsPDF/CSVexplicitreviewonly. Notice matches reusealreadyreconciledactualpaymentcoverage; correctionisimmutablehistory anddoesnotreverseactualmoney. Operationalcompletionderivedfromallsourceconditions, commercialCLOSED nevermeansallDone. SourcegrantRLS/costprivacy preserved; no openinggate/stateflip/backfillmoney/price/quantities. 156unappliedviewdependencyerror rolledbackthenfixedbeforeapply;155–164appliedimmutable.

Finalfresh164allmigrations/RLSmissing0 passed; restorepre164/schema163ownedclone PASS122bảng/history163/hash tạiFINAL_RECOVERY163. Everyforwardmanifest oldpubliccols/rows/hashunchanged, representativeDB includesoldsourcefacts/openroles/realQAUIDlocalshims. NoManagedAuth/Storage/PITRrecoveryclaim. Afternewpostedsourcefacts, restoreisolatedarchiveandreconcile, no destructiveDROP/downmigration. NoProductiondeploy/DML/realmoney/emission.

## Chứng minh nâng cấp cuối từ dữ liệu phiên bản trước

`FINAL_RESTORE136` khôi phục archive trước137 vào bản sao độc lập;110 bảng public, hash và history136 khớp. `FINAL_UPGRADE136_TO164` áp dụng28 migration còn thiếu; từng bước đối chiếu119 bảng public/private theo đúng cột cũ, số dòng và hash. Facts, quyền, trạng thái vận hành và phiên bản cũ được giữ nguyên. Sau nâng cấp có164 migration và không bảng public nào thiếu RLS.

MainQA không bị reset; checkout gốc giữ nguyên. Backup được giữ riêng với mode600 và không commit. Code649dd17 giữ các migration đã áp dụng bất biến. Fresh164 và archive163 đều đạt; đây là phục hồi DB ứng dụng tại nativeQA với AuthUID shim, không phải Managed Auth/Storage/PITR.

Trước nâng cấp môi trường thật: kiểm backup/dung lượng và nguồn cargo, legacycredit, paidreview; đóng lưu lượng ghi; áp dụng theo thứ tự toàn bộ migration87–164 sau nền PR41/schema86; kiểm RPC và readers cuối. Không backfill tiền, kho, activation hoặc giá chứng từ.

Nếu chưa có facts mới, dùng bản ứng dụng tương thích schema hoặc khôi phục archive đã xác minh trên bản sao. Nếu đã có facts mới, giữ journal/sourceIDs và đối chiếu phần phát sinh; dùng forwardfix hoặc kế hoạch restore bảo toàn dữ liệu. Không DROP/downmigration để xóa ledger mới. Chưa diễn tập failover Production; task này không nâng cấp hay triển khai Production.

## Rà soát cuối /165–169

165 cost trả vật lý tính theo chênh lệch giá trị lũy kế nguồn; không rewrite movement/DCE cũ.166 bắt buộc reason trước effect, cache thànhcông vẫn trả trước guardmới.167–169 phải đi cùng binary mới: client không tựfinalizePENDING; máy chủ upload/readback actualbyte+magic+size+SHA và gọi service-onlyRPC vớiactor từsession; privateattestation immutablerecord chothao tác đãđốichiếu. READY khôngwrite qua publicStorage; internalpolicies dùngbranch/meta chínhxác. Không tựbackfill assetlegacy thànhtruth.

Mỗiforward đã cóbackup riêng600, hash/count toàncột public cũ giữ nguyên. Chỉ áp dụng165–169 cònthiếu trên bản sao136→164; nguồn cũ tiếpnhận1000đ/1receipt/1AP/1movement vàseparate retry đạt. Fresh từ0→165đãđạt, chỉáp dụng166–169 cònthiếu đến169; khôngmigrate lại từđầu. NoNativeStorage.objects fake.

Trước mởtraffic: cấu hình private SUPABASE_SECRET_KEY trênserver vàbackendStorage thực/buckets/policies, xác minh quyềnservice-role, chạy T39-S1..S5. Kiểm assetlegacy actualdownload/hash vàthêmattestationquađườngtrustedserver cóquyền; mismatch/mấtfile không sửaSHA haygiảVerified, tạo hồsơ/nguồn minhchứng đúng cótruyvết. Source bắtbuộcminhchứng bịgiữ lại nếu assetkhôngđủ; nguồn optionalnull không thànhgate đầu kỳ. Chưa cóStorage đểdiễntậptrongtasknày, vìvậy đây làblockerphát hànhluồngfile.

Rollbackbinary trước167 không được dùng đểfinalize/tiếpnhậnminhchứngsau169; phối hợpbackup/binary/migrationvàđóngwrite. Sauposts mới khôngDROP ledger/attestation đểrollback; giữsourceIDs vàđốichiếu, forwardfix hoặcrestorebản sao đãkiểm vàbảo toànphát sinh. NativeDBarchive khôngManagedAuth/Storage/PITR; phảidiễntậprecovery riêngtrênQA tươngứngtrướcProduction.

## Bổ sung170–174 và Storage QA thật

Đọc RELEASE_BLOCKERS để phân biệt QA đã đạt với điều kiện môi trường đích.170 thêm binding bất biến tới Storage object id/version, chặn authenticated replace/delete và dùng upload không upsert;171 thêm basis byte/hash vào reader để máy chủ so download;172 ghi attestation và audit ngay lần finalize nội bộ đầu.173–174 là chẩn đoán đã gỡ, không giữ API danh tính/quyền mới; các file đã apply được giữ bất biến.

QA cloud đã backup riêng mode600, TLSverify-full;85→172 history sau87 file còn thiếu trong một TX giữ hash111 bảng public/private/Storage theo toàn cột cũ; thêm172–174 chỉ DDL. History cuối175 =174 canonical+một hotfix riêng20261002114730, không xóa/đổi tên history. Native main/fresh/bản sao136→164 chỉ thêm170–174, backup từng forward; không chạy lại migration đã hoàn tất.

Trước triển khai thật: chặn traffic ghi, kiểm drift theo định nghĩa/hash và nguồn; backupDB cùng binary/schema và bản sao byte Storage có inventory id/version/hash. Không dùng DB dump để tuyên bố byte Storage đã backup. Kiểm actualserverkey/buckets private/policies và chế độ phục hồi; áp dụng đầy đủgói canonical phù hợp, reloadPostgREST rồi smoke test đúng quyền. Phải xử lý inventorylegacy theo MATCH/MISMATCH/MISSING/INCONCLUSIVE và Owner chi nhánh; không tựbackfill tất cả.

Một file đổi sau xác minh làm binding cũ không còn hiệu lực. Không sửaSHA/metadata cũ hay đảo facts; tạo minh chứng mới theo hồ sơ xử lý. Lệnh đãcommit mấtresponse được lookup/retry cùngintent. Nếu cần rollback sau phát sinh, giữjournal/sourceIDs/fileversions và đối chiếu; ưu tiên forwardfix hoặc restore đã kiểm có bảo toàn phát sinh. Không downmigration/drop attestation/binding/ledger. Chưa diễn tậprestore byte/ManagedAuth/PITR ở môi trường đích; vẫn là điều kiện triển khai. Task không thực hiệnProduction.
